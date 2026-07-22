-- Client Profiles: lets an agency add/edit a client's basic info any time,
-- with no payment involved. Adds a logo to accounts, and the ClickUp Folder
-- id to agencies so the app can auto-create a new client's ClickUp List
-- (inside the agency's own Folder) the moment a profile is created.
alter table public.accounts add column logo_url text;
alter table public.agencies add column clickup_folder_id text;
