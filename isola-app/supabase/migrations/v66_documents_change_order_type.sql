-- v66: Docs tab gets a "Change order" type, filed against the job like proposals.
alter table public.documents drop constraint documents_type_ck;
alter table public.documents add constraint documents_type_ck check (doc_type = any (array['coi','w9','lien_waiver','permit','contract','proposal','change_order','warranty','license','other']));
