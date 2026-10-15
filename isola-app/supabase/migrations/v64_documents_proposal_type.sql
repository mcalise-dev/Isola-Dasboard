-- v64: Docs tab gets a "Proposal" type. Every client proposal is filed here against its job.
alter table public.documents drop constraint documents_type_ck;
alter table public.documents add constraint documents_type_ck check (doc_type = any (array['coi','w9','lien_waiver','permit','contract','proposal','warranty','license','other']));
