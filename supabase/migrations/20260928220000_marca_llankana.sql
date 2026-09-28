-- =============================================================================
-- Cambio de nombre: Acolita.App pasa a llamarse Llankana (ADR-017).
--
-- Solo renombra identificadores internos y textos guardados; no cambia reglas:
--   * Realtime: los tokens propios del servidor pasan a `iss = 'llankana'`
--     (src/server/realtime/token.ts) y la política de canales privados se renombra.
--   * Variable de sesión del actor de moderación: `acolita.actor` → `llankana.actor`
--     (las tres funciones que la fijan se redefinen sin otros cambios).
--   * Tareas pg_cron: `llankana-contratos-plazos` y `llankana-moderacion-vigencias`.
--   * Textos: pregunta frecuente, nombre de la capacitación general y la reseña del
--     trabajador ficticio del seed.
-- Los documentos legales publicados son inmutables (RN-18): el nombre nuevo llega con
-- la próxima versión que publique el GAD desde el panel.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Realtime: emisor de los tokens del servidor
-- -----------------------------------------------------------------------------

/*
 * ¿El JWT actual puede leer el canal? Solo tokens del servidor del portal (iss = 'llankana')
 * de usuarios ACTIVOS: `user:{id}` para su dueño y `conversation:{id}` para sus dos partes.
 * SECURITY DEFINER porque el rol authenticated no lee las tablas de negocio.
 */
create or replace function private.can_read_realtime_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := auth.jwt();
  v_sub uuid;
begin
  if v_claims ->> 'iss' is distinct from 'llankana' or p_topic is null then
    return false;
  end if;
  begin
    v_sub := (v_claims ->> 'sub')::uuid;
  exception when others then
    return false;
  end;
  if not exists (select 1 from public.users where id = v_sub and status = 'ACTIVO') then
    return false;
  end if;
  if p_topic = 'user:' || v_sub::text then
    return true;
  end if;
  if p_topic like 'conversation:%' then
    return exists (
      select 1 from public.conversations c join public.worker_profiles w on w.id = c.worker_id
      where c.id::text = substr(p_topic, 14) and (c.client_user_id = v_sub or w.user_id = v_sub)
    );
  end if;
  return false;
end;
$$;


drop policy if exists acolita_private_channels_read on realtime.messages;
create policy llankana_private_channels_read on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and private.can_read_realtime_topic((select realtime.topic())));

-- -----------------------------------------------------------------------------
-- Actor de moderación (variable de sesión que leen los triggers de denuncias)
-- -----------------------------------------------------------------------------

create or replace function private.current_actor()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  return nullif(current_setting('llankana.actor', true), '')::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.fn_admin_report_update(
  p_actor_id uuid,
  p_report_id uuid,
  p_op text,
  p_note text default null,
  p_resolution text default null,
  p_priority integer default null,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns public.report_status
language plpgsql
set search_path = ''
as $$
declare
  v_r public.reports;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform private.require_permission(p_actor_id, 'report.manage');
  perform set_config('llankana.actor', p_actor_id::text, true);
  v_r := private.require_open_report(p_report_id);
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'La nota admite hasta 1000 caracteres' using errcode = 'check_violation';
  end if;
  if p_op <> 'NOTE' and v_r.status in ('RESUELTA', 'DESCARTADA') then
    raise exception 'La denuncia ya está cerrada' using errcode = 'object_not_in_prerequisite_state';
  end if;
  -- La denuncia de una disputa se cierra al resolver la disputa (finalizar o cancelar la contratación).
  if p_op in ('RESOLVE', 'DISCARD') and exists (
       select 1 from public.contracts k where k.dispute_report_id = v_r.id and k.status = 'EN_DISPUTA') then
    raise exception 'Resuelve primero la disputa de la contratación (finalizarla o cancelarla)'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  case p_op
    when 'ASSIGN_ME' then
      update public.reports set assigned_to = p_actor_id, assigned_at = now(),
        status = case when status = 'ABIERTA' then 'EN_REVISION'::public.report_status else status end
        where id = p_report_id returning * into v_r;
    when 'UNASSIGN' then
      update public.reports set assigned_to = null, assigned_at = null where id = p_report_id returning * into v_r;
    when 'PRIORITY' then
      if p_priority is null or p_priority not between 1 and 3 then
        raise exception 'Prioridad no válida' using errcode = 'check_violation';
      end if;
      update public.reports set priority = p_priority where id = p_report_id returning * into v_r;
    when 'REVIEW' then
      update public.reports set status = 'EN_REVISION', assigned_to = coalesce(assigned_to, p_actor_id),
        assigned_at = coalesce(assigned_at, now()) where id = p_report_id returning * into v_r;
    when 'REQUEST_INFO' then
      if char_length(coalesce(v_note, '')) < 10 then
        raise exception 'Indica qué información necesitas (al menos 10 caracteres)' using errcode = 'check_violation';
      end if;
      update public.reports set status = 'EN_ESPERA_DE_INFORMACION' where id = p_report_id returning * into v_r;
      insert into public.report_events (report_id, event, actor_id, note, visible_to_reporter)
      values (p_report_id, 'INFO_SOLICITADA', p_actor_id, v_note, true);
      update public.notifications set body = left(v_note, 300)
        where user_id = v_r.reporter_id and dedupe_key = 'report:' || p_report_id and read_at is null;
    when 'ESCALATE' then
      if char_length(coalesce(v_note, '')) < 10 then
        raise exception 'Explica por qué escalas el caso (al menos 10 caracteres)' using errcode = 'check_violation';
      end if;
      update public.reports set status = 'ESCALADA' where id = p_report_id returning * into v_r;
      insert into public.report_events (report_id, event, actor_id, note) values (p_report_id, 'NOTA_INTERNA', p_actor_id, v_note);
    when 'RESOLVE' then
      if p_resolution is null or p_resolution not in ('MEDIDAS_APLICADAS', 'SIN_INCUMPLIMIENTO', 'RESUELTO_ENTRE_PARTES', 'DUPLICADA', 'OTRO') then
        raise exception 'Elige el resultado de la denuncia' using errcode = 'check_violation';
      end if;
      if char_length(coalesce(v_note, '')) < 10 then
        raise exception 'Registra la justificación de la resolución (al menos 10 caracteres)' using errcode = 'check_violation';
      end if;
      update public.reports set status = 'RESUELTA', resolution = p_resolution, resolution_note = v_note,
        resolved_by = p_actor_id where id = p_report_id returning * into v_r;
    when 'DISCARD' then
      if char_length(coalesce(v_note, '')) < 10 then
        raise exception 'Explica por qué se descarta (al menos 10 caracteres)' using errcode = 'check_violation';
      end if;
      update public.reports set status = 'DESCARTADA', resolution_note = v_note, resolved_by = p_actor_id
        where id = p_report_id returning * into v_r;
    when 'NOTE' then
      if v_note is null then
        raise exception 'Escribe la nota' using errcode = 'check_violation';
      end if;
      insert into public.report_events (report_id, event, actor_id, note) values (p_report_id, 'NOTA_INTERNA', p_actor_id, v_note);
      update public.reports set updated_at = now() where id = p_report_id returning * into v_r;
    else
      raise exception 'Operación no válida' using errcode = 'check_violation';
  end case;

  perform private.audit(p_actor_id,
    case p_op when 'ASSIGN_ME' then 'REPORT_ASSIGNED' when 'UNASSIGN' then 'REPORT_ASSIGNED'
              when 'RESOLVE' then 'REPORT_RESOLVED' when 'NOTE' then 'REPORT_NOTE_ADDED'
              else 'REPORT_STATUS_CHANGED' end,
    'report', p_report_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('op', p_op, 'status', v_r.status, 'resolution', p_resolution, 'priority', p_priority));
  return v_r.status;
end;
$$;

create or replace function public.fn_admin_apply_moderation(
  p_actor_id uuid,
  p_report_id uuid,
  p_action text,
  p_reason text,
  p_ends_at timestamptz default null,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_r public.reports;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_worker public.worker_profiles;
  v_target_user uuid;
  v_message bigint;
  v_review uuid;
  v_id uuid;
  v_tokens text[] := '{}';
begin
  if p_action in ('ADVERTENCIA', 'OCULTAR_MENSAJE', 'OCULTAR_RESENA') then
    perform private.require_permission(p_actor_id, 'moderation.act');
  elsif p_action in ('SUSPENDER_TRABAJADOR', 'DESHABILITAR_TRABAJADOR', 'SUSPENDER_CUENTA', 'BLOQUEAR_CUENTA') then
    perform private.require_permission(p_actor_id, 'report.manage');
  else
    raise exception 'Acción no válida' using errcode = 'check_violation';
  end if;
  perform set_config('llankana.actor', p_actor_id::text, true);
  if char_length(v_reason) not between 10 and 1000 then
    raise exception 'Registra el motivo de la acción (10 a 1000 caracteres)' using errcode = 'check_violation';
  end if;
  v_r := private.require_open_report(p_report_id);
  if v_r.status in ('RESUELTA', 'DESCARTADA') then
    raise exception 'La denuncia ya está cerrada' using errcode = 'object_not_in_prerequisite_state';
  end if;
  v_target_user := v_r.reported_user_id;
  select * into v_worker from public.worker_profiles
    where id = case when v_r.target_type = 'WORKER' then v_r.target_id::uuid end
       or (v_r.target_type <> 'WORKER' and user_id = v_r.reported_user_id)
    limit 1;

  if p_action in ('SUSPENDER_TRABAJADOR', 'SUSPENDER_CUENTA')
     and (p_ends_at is null or p_ends_at <= now() or p_ends_at > now() + interval '366 days') then
    raise exception 'Indica hasta cuándo dura la suspensión (máximo un año)' using errcode = 'check_violation';
  end if;
  if v_target_user is not null and private.is_staff_account(v_target_user) then
    raise exception 'Las cuentas del personal del GAD no se sancionan desde aquí' using errcode = 'check_violation';
  end if;

  case p_action
    when 'ADVERTENCIA' then
      if v_target_user is null then
        raise exception 'La persona denunciada no tiene cuenta a la que advertir' using errcode = 'check_violation';
      end if;
      insert into public.notifications (user_id, type, title, body, link)
      values (v_target_user, 'MODERATION_WARNING', 'Advertencia del GAD', left(v_reason, 300), '/cuenta');
    when 'OCULTAR_MENSAJE' then
      if v_r.target_type <> 'MESSAGE' then
        raise exception 'Esta denuncia no es sobre un mensaje' using errcode = 'check_violation';
      end if;
      v_message := v_r.target_id::bigint;
      update public.messages set hidden_at = now(), hidden_by = p_actor_id, hidden_reason = left(v_reason, 500)
        where id = v_message and hidden_at is null;
      if not found then
        raise exception 'El mensaje ya está oculto' using errcode = 'object_not_in_prerequisite_state';
      end if;
    when 'OCULTAR_RESENA' then
      if v_r.target_type <> 'REVIEW' then
        raise exception 'Esta denuncia no es sobre una reseña' using errcode = 'check_violation';
      end if;
      v_review := v_r.target_id::uuid;
      update public.reviews set status = 'OCULTA', hidden_at = now(), hidden_by = p_actor_id, hidden_reason = left(v_reason, 500)
        where id = v_review and status = 'PUBLICADA';
      if not found then
        raise exception 'La reseña ya está oculta' using errcode = 'object_not_in_prerequisite_state';
      end if;
    when 'SUSPENDER_TRABAJADOR', 'DESHABILITAR_TRABAJADOR' then
      if v_worker.id is null then
        raise exception 'La denuncia no involucra a un trabajador' using errcode = 'check_violation';
      end if;
      if p_action = 'SUSPENDER_TRABAJADOR' and v_worker.status <> 'HABILITADO' then
        raise exception 'Solo se suspende a un trabajador habilitado' using errcode = 'object_not_in_prerequisite_state';
      end if;
      if p_action = 'DESHABILITAR_TRABAJADOR' and v_worker.status not in ('HABILITADO', 'SUSPENDIDO') then
        raise exception 'El trabajador no está habilitado ni suspendido' using errcode = 'object_not_in_prerequisite_state';
      end if;
      perform private.apply_worker_status(v_worker.id,
        case when p_action = 'SUSPENDER_TRABAJADOR' then 'SUSPENDIDO' else 'INACTIVO' end::public.worker_status,
        'Moderación: ' || v_reason, p_actor_id, case when p_action = 'SUSPENDER_TRABAJADOR' then p_ends_at end);
      v_target_user := coalesce(v_worker.user_id, v_target_user);
    when 'SUSPENDER_CUENTA', 'BLOQUEAR_CUENTA' then
      if v_target_user is null then
        raise exception 'La persona denunciada no tiene cuenta' using errcode = 'check_violation';
      end if;
      update public.users set status = 'BLOQUEADO', blocked_reason = left('Moderación: ' || v_reason, 500)
        where id = v_target_user and status = 'ACTIVO';
      if not found then
        raise exception 'La cuenta no está activa' using errcode = 'object_not_in_prerequisite_state';
      end if;
      with revocadas as (
        update public.auth_sessions set revoked_at = now()
        where user_id = v_target_user and revoked_at is null returning tokens_enc)
      select coalesce(array_agg(tokens_enc::text), '{}') into v_tokens from revocadas;
  end case;

  insert into public.moderation_actions (report_id, action, target_user_id, worker_id, message_id, review_id, reason, ends_at, actor_id)
  values (p_report_id, p_action, v_target_user,
          case when p_action in ('SUSPENDER_TRABAJADOR', 'DESHABILITAR_TRABAJADOR') then v_worker.id end,
          v_message, v_review, v_reason,
          case when p_action in ('SUSPENDER_TRABAJADOR', 'SUSPENDER_CUENTA') then p_ends_at end, p_actor_id)
  returning id into v_id;
  insert into public.report_events (report_id, event, actor_id, note)
  values (p_report_id, 'ACCION', p_actor_id, p_action || ': ' || v_reason);
  if v_r.status = 'ABIERTA' then
    update public.reports set status = 'EN_REVISION', assigned_to = coalesce(assigned_to, p_actor_id),
      assigned_at = coalesce(assigned_at, now()) where id = p_report_id;
  end if;
  perform private.audit(p_actor_id, 'MODERATION_ACTION_APPLIED', 'moderation_action', v_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('action', p_action, 'reportId', p_report_id, 'targetUserId', v_target_user, 'endsAt', p_ends_at));
  return jsonb_build_object('id', v_id, 'revokedTokens', to_jsonb(v_tokens));
end;
$$;

create or replace function public.fn_admin_lift_moderation(
  p_actor_id uuid,
  p_action_id uuid,
  p_reason text,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_a public.moderation_actions;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_changed boolean;
begin
  select * into v_a from public.moderation_actions where id = p_action_id for update;
  if not found then
    raise exception 'Acción no encontrada' using errcode = 'no_data_found';
  end if;
  perform private.require_permission(p_actor_id,
    case when v_a.action in ('ADVERTENCIA', 'OCULTAR_MENSAJE', 'OCULTAR_RESENA') then 'moderation.act' else 'report.manage' end);
  perform set_config('llankana.actor', p_actor_id::text, true);
  if v_a.lifted_at is not null then
    raise exception 'La acción ya no está vigente' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if v_a.action in ('ADVERTENCIA', 'DESHABILITAR_TRABAJADOR') then
    raise exception 'Esta acción no se revoca desde aquí (reactiva al trabajador desde su ficha)'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  if char_length(v_reason) not between 10 and 500 then
    raise exception 'Registra el motivo (10 a 500 caracteres)' using errcode = 'check_violation';
  end if;
  v_changed := private.moderation_undo(v_a, p_actor_id, 'Sanción revocada: ' || v_reason);
  update public.moderation_actions set lifted_at = now(), lifted_by = p_actor_id, lift_reason = v_reason where id = p_action_id;
  if v_a.report_id is not null then
    insert into public.report_events (report_id, event, actor_id, note)
    values (v_a.report_id, 'ACCION_REVOCADA', p_actor_id, v_a.action || ': ' || v_reason);
  end if;
  perform private.audit(p_actor_id, 'MODERATION_ACTION_LIFTED', 'moderation_action', p_action_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('action', v_a.action, 'effectUndone', v_changed));
  return v_changed;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tareas pg_cron con el nombre nuevo
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job
      where jobname in ('acolita-contratos-plazos', 'acolita-moderacion-vigencias');
    perform cron.schedule('llankana-contratos-plazos', '*/15 * * * *', 'select public.fn_run_contract_maintenance()');
    perform cron.schedule('llankana-moderacion-vigencias', '*/15 * * * *', 'select public.fn_run_moderation_maintenance()');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Textos guardados con el nombre anterior
-- -----------------------------------------------------------------------------

update public.faq_items set question = '¿Qué es Llankana?' where question = '¿Qué es Acolita.App?';

update public.trainings set name = 'Capacitación general Llankana'
  where code = 'GENERAL' and name = 'Capacitación general Acolita';

update public.worker_profiles set public_bio = replace(public_bio, 'Recién inicia en Acolita.', 'Recién inicia en Llankana.')
  where public_bio like 'Recién inicia en Acolita.%';
