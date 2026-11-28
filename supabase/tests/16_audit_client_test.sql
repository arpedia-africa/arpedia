-- Flow 16 · 16-4 (rule 22): audit entries record the staff browser the console forwards
-- (x-client-*), and fall back to the connection's own headers for everything else.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- From the console: browser details forwarded beside the server's own.
select set_config('request.headers', json_build_object(
  'x-client-ip', '102.89.1.7', 'x-client-user-agent', 'Mozilla/5.0 Chrome/131', 'x-client-request-id', 'cdg1::abc',
  'cf-connecting-ip', '76.76.21.1', 'user-agent', 'node', 'cf-ray', 'ray1')::text, true);
select public.write_audit('settings', 'test.console', 'thing', '1');
select is((select ip from public.audit_log where action = 'test.console'), '102.89.1.7'::inet, 'the browser address');
select is((select device from public.audit_log where action = 'test.console'), 'Mozilla/5.0 Chrome/131', 'the browser');
select is((select request_id from public.audit_log where action = 'test.console'), 'cdg1::abc', 'the console request id');

-- Direct calls (app, desk CLI): the connection's headers, as before.
select set_config('request.headers', json_build_object(
  'cf-connecting-ip', '41.58.2.3', 'x-forwarded-for', '9.9.9.9', 'user-agent', 'desk/1.0', 'cf-ray', 'ray2')::text, true);
select public.write_audit('settings', 'test.direct', 'thing', '2');
select is((select ip from public.audit_log where action = 'test.direct'), '41.58.2.3'::inet, 'the connecting address');
select is((select device || ' ' || request_id from public.audit_log where action = 'test.direct'), 'desk/1.0 ray2',
  'the connection''s device and request id');

-- A forwarded value that isn't an address falls back instead of failing the action.
select set_config('request.headers', json_build_object('x-client-ip', 'not-an-ip', 'x-forwarded-for', '10.0.0.5, 1.1.1.1')::text, true);
select lives_ok($$ select public.write_audit('settings', 'test.bad', 'thing', '3') $$, 'a bad forwarded address never errors');
select is((select ip from public.audit_log where action = 'test.bad'), '10.0.0.5'::inet, 'falls back to the first forwarded hop');

select * from finish();
rollback;
