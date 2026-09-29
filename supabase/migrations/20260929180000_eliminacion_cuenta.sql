-- =============================================================================
-- Eliminación de cuenta por el titular (ADR-018). Google Play la exige a las apps que permiten
-- crear cuenta, dentro de la app y en una página web; la LOPDP reconoce el derecho de supresión.
--
-- Decisiones del usuario (2026-09-29):
--   * Inmediata e irreversible: se anonimiza todo en una transacción.
--   * Se impide con contrataciones en marcha (CONTRATADA, EN_CURSO, FINALIZACION_PENDIENTE,
--     EN_DISPUTA). Las propuestas sin aceptar se cancelan solas y se avisa a la otra parte.
--   * Trabajador vinculado: la ficha sale del catálogo y se anonimiza; se borran foto,
--     documentos, oficios y códigos. Quedan las estadísticas (calificación, contrataciones).
--   * Mensajes y reseñas se conservan; el autor aparece como «Cuenta eliminada».
--   * La cuenta de Cognito NO se borra: es la cuenta ciudadana del GAD y la usan otros servicios.
--     Se borran las identidades, así un nuevo ingreso crea una cuenta nueva y vacía.
--   * La fila de `users` queda como seudónimo (estado ELIMINADO): la referencian contrataciones,
--     mensajes, reseñas, denuncias y la auditoría, que se conservan (modelo de datos §7).
-- =============================================================================

-- Nombre visible de una cuenta eliminada (usuario y ficha de trabajador).
create or replace function private.deleted_account_name()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'Cuenta eliminada';
$$;

-- "Cuenta eliminada" no se abrevia a "Cuenta E.".
create or replace function private.short_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(btrim(p_name), '') = '' then 'Usuario'
    when btrim(p_name) = private.deleted_account_name() then private.deleted_account_name()
    when array_length(regexp_split_to_array(btrim(p_name), '\s+'), 1) = 1 then btrim(p_name)
    else split_part(btrim(p_name), ' ', 1) || ' '
         || upper(left((regexp_split_to_array(btrim(p_name), '\s+'))[
              greatest(2, array_length(regexp_split_to_array(btrim(p_name), '\s+'), 1) - 1)], 1)) || '.'
  end;
$$;

-- -----------------------------------------------------------------------------
-- Ficha de trabajador eliminada: queda congelada
-- -----------------------------------------------------------------------------

alter table public.worker_profiles add column deleted_at timestamptz;

comment on column public.worker_profiles.deleted_at is
  'La cuenta del trabajador se eliminó (ADR-018): ficha anonimizada e INACTIVA; no admite cambios.';

-- Solo cambian las estadísticas (una reseña se puede editar o moderar después) y el texto de búsqueda.
create or replace function private.worker_profiles_deleted_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is not null
     and (to_jsonb(new) - array['rating_avg', 'rating_count', 'contracts_completed', 'search_text',
                                'search_vector', 'updated_at'])
         is distinct from
         (to_jsonb(old) - array['rating_avg', 'rating_count', 'contracts_completed', 'search_text',
                                'search_vector', 'updated_at']) then
    raise exception 'La ficha pertenece a una cuenta eliminada' using errcode = 'object_not_in_prerequisite_state';
  end if;
  return new;
end;
$$;

create trigger worker_profiles_deleted_guard before update on public.worker_profiles
  for each row execute function private.worker_profiles_deleted_guard();

-- Nada nuevo cuelga de una ficha eliminada (oficios, documentos, capacitaciones, códigos).
create or replace function private.worker_child_deleted_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.worker_profiles where id = new.worker_id and deleted_at is not null) then
    raise exception 'La ficha pertenece a una cuenta eliminada' using errcode = 'object_not_in_prerequisite_state';
  end if;
  return new;
end;
$$;

create trigger worker_services_deleted_guard before insert on public.worker_services
  for each row execute function private.worker_child_deleted_guard();
create trigger worker_documents_deleted_guard before insert on public.worker_documents
  for each row execute function private.worker_child_deleted_guard();
create trigger training_enrollments_deleted_guard before insert on public.training_enrollments
  for each row execute function private.worker_child_deleted_guard();
create trigger worker_activation_codes_deleted_guard before insert on public.worker_activation_codes
  for each row execute function private.worker_child_deleted_guard();

-- -----------------------------------------------------------------------------
-- Verificación previa (qué impide eliminar y qué se cancelará)
-- -----------------------------------------------------------------------------

/*
 * Contrataciones que impiden eliminar la cuenta y propuestas que se cancelarían. Aplica antes
 * los vencimientos pendientes (una propuesta expirada no se cancela; una finalización vencida
 * deja de bloquear).
 */
create or replace function public.fn_account_deletion_check(p_user_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_worker uuid;
begin
  perform private.require_chat_user(p_user_id);
  perform private.contract_timeouts_for_user(p_user_id);
  select id into v_worker from public.worker_profiles where user_id = p_user_id;

  return jsonb_build_object(
    'isWorker', v_worker is not null,
    'blockingContracts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'status', c.status,
               'role', case when c.client_user_id = p_user_id then 'CLIENTE' else 'TRABAJADOR' end,
               'counterpartName', private.contract_party_name(c,
                 case when c.client_user_id = p_user_id then 'TRABAJADOR' else 'CLIENTE' end))
             order by c.created_at)
      from public.contracts c
      where (c.client_user_id = p_user_id or c.worker_id = v_worker)
        and c.status in ('CONTRATADA', 'EN_CURSO', 'FINALIZACION_PENDIENTE', 'EN_DISPUTA')), '[]'::jsonb),
    'pendingProposals', (
      select count(*) from public.contracts c
      where (c.client_user_id = p_user_id or c.worker_id = v_worker) and c.status = 'PROPUESTA_ENVIADA')
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Eliminación
-- -----------------------------------------------------------------------------

/*
 * Elimina la cuenta del titular. Devuelve lo que el servidor debe limpiar fuera de la base:
 * `tokens` (refresh tokens cifrados de las sesiones web, para revocarlos en Cognito) y `files`
 * (rutas del bucket `worker-files`: foto y documentos del trabajador).
 * 55000 si hay contrataciones en marcha.
 *
 * SECURITY DEFINER: borra filas de tablas en las que el servidor (service_role) no tiene DELETE
 * (sesiones, perfil, notificaciones, dispositivos, documentos, códigos) y no conviene dárselo
 * para todo lo demás. Solo service_role puede ejecutarla.
 */
create or replace function public.fn_delete_account(
  p_user_id uuid,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name constant text := private.deleted_account_name();
  v_reason constant text := 'La otra parte eliminó su cuenta';
  v_worker public.worker_profiles;
  v_c public.contracts;
  v_t public.contract_terms;
  v_bloqueantes integer;
  v_canceladas integer := 0;
  v_conversaciones integer;
  v_tokens text[];
  v_files text[] := '{}'::text[];
begin
  perform private.require_chat_user(p_user_id);
  perform 1 from public.users where id = p_user_id for update;
  perform private.contract_timeouts_for_user(p_user_id);
  select * into v_worker from public.worker_profiles where user_id = p_user_id for update;

  select count(*) into v_bloqueantes from public.contracts c
  where (c.client_user_id = p_user_id or c.worker_id = v_worker.id)
    and c.status in ('CONTRATADA', 'EN_CURSO', 'FINALIZACION_PENDIENTE', 'EN_DISPUTA');
  if v_bloqueantes > 0 then
    raise exception 'Tienes % contratación(es) en marcha. Termínalas o cancélalas antes de eliminar tu cuenta.', v_bloqueantes
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- Auditoría primero: registra los roles que tenía la cuenta.
  perform private.audit(p_user_id, 'ACCOUNT_DELETED', 'user', p_user_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('worker', v_worker.id));

  -- Propuestas sin aceptar: se cancelan y se avisa a la otra parte (el aviso sale antes de
  -- anonimizar, con el nombre que la otra parte conocía).
  for v_c in
    select * from public.contracts c
    where (c.client_user_id = p_user_id or c.worker_id = v_worker.id) and c.status = 'PROPUESTA_ENVIADA'
    for update
  loop
    select * into v_t from public.contract_terms where id = v_c.current_terms_id;
    update public.contract_terms
      set withdrawn_at = case when v_t.proposed_by = p_user_id then now() end,
          rejected_at = case when v_t.proposed_by <> p_user_id then now() end,
          rejected_by = case when v_t.proposed_by <> p_user_id then p_user_id end,
          response_note = v_reason
      where id = v_t.id;
    update public.contracts
      set status = 'CANCELADA', expires_at = null, cancelled_at = now(), cancelled_by = p_user_id,
          cancel_reason = v_reason
      where id = v_c.id returning * into v_c;
    perform private.contract_log(v_c.id, 'CUENTA_ELIMINADA', p_user_id, 'PROPUESTA_ENVIADA', 'CANCELADA', v_t.version);
    perform private.contract_announce(v_c, p_user_id,
      private.contract_party_name(v_c, case when v_c.client_user_id = p_user_id then 'CLIENTE' else 'TRABAJADOR' end)
        || ' eliminó su cuenta. La propuesta (versión ' || v_t.version || ') quedó cancelada.',
      'Propuesta cancelada', v_t.id);
    v_canceladas := v_canceladas + 1;
  end loop;

  -- Conversaciones: la otra parte conserva el historial, pero ya no se puede escribir.
  update public.conversations set status = 'CERRADA'
  where (client_user_id = p_user_id or worker_id = v_worker.id) and status <> 'CERRADA';
  get diagnostics v_conversaciones = row_count;

  -- Ficha de trabajador: fuera del catálogo y sin datos personales.
  if v_worker.id is not null then
    v_files := array_remove(array[v_worker.photo_path, v_worker.photo_pending_path], null)
      || coalesce((select array_agg(storage_path) from public.worker_documents where worker_id = v_worker.id), '{}');

    update public.training_enrollments set evidence_document_id = null, result_note = null
      where worker_id = v_worker.id;
    delete from public.worker_documents where worker_id = v_worker.id;
    delete from public.worker_services where worker_id = v_worker.id;
    delete from public.worker_activation_codes where worker_id = v_worker.id;

    if v_worker.status <> 'INACTIVO' then
      insert into public.worker_status_history (worker_id, from_status, to_status, reason, actor_id)
      values (v_worker.id, v_worker.status, 'INACTIVO', 'Cuenta eliminada por el titular', p_user_id);
    end if;

    update public.worker_profiles
      set user_id = null, first_names = 'Cuenta', last_names = 'eliminada', public_display_name = v_name,
          phone = null, email = null, address = null, birth_date = null,
          emergency_contact_name = null, emergency_contact_phone = null,
          specialty = null, public_bio = null, availability_note = null, is_available = false,
          photo_path = null, photo_pending_path = null, photo_status = 'SIN_FOTO', photo_review_note = null,
          proposed_bio = null, proposed_availability_note = null, proposal_submitted_at = null,
          proposal_review_note = null, parish_id = null,
          status = 'INACTIVO', status_changed_at = now(), suspended_until = null,
          deleted_at = now()
      where id = v_worker.id;
  end if;

  -- Datos de la cuenta.
  select coalesce(array_agg(tokens_enc), '{}') into v_tokens
    from public.auth_sessions where user_id = p_user_id and revoked_at is null;
  delete from public.auth_sessions where user_id = p_user_id;
  delete from public.user_identities where user_id = p_user_id;
  delete from public.client_profiles where user_id = p_user_id;
  delete from public.notifications where user_id = p_user_id;
  delete from public.notification_outbox where recipient_id = p_user_id;
  delete from public.device_tokens where user_id = p_user_id;
  update public.user_roles set revoked_at = now(), revoked_by = p_user_id
    where user_id = p_user_id and revoked_at is null;

  update public.users
    set status = 'ELIMINADO', email = null, email_verified = false, display_name = v_name,
        blocked_reason = null, master_user_id = null, last_login_at = null, push_announcements = false,
        tokens_valid_after = now()
    where id = p_user_id;

  return jsonb_build_object(
    'cancelledProposals', v_canceladas,
    'closedConversations', v_conversaciones,
    'tokens', to_jsonb(v_tokens),
    'files', to_jsonb(v_files));
end;
$$;

revoke execute on function
  private.deleted_account_name(),
  private.worker_profiles_deleted_guard(),
  private.worker_child_deleted_guard(),
  public.fn_account_deletion_check(uuid),
  public.fn_delete_account(uuid, inet, text, text)
  from public, anon, authenticated;

grant execute on function
  private.deleted_account_name(),
  public.fn_account_deletion_check(uuid),
  public.fn_delete_account(uuid, inet, text, text)
  to service_role;
