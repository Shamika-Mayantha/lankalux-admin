-- How each website enquiry found lankalux.com (search, social, campaign link) and the pages involved.
alter table public."Client Requests" add column if not exists traffic_source text;
