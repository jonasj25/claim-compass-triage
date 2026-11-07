
insert into public.policy_versions (id, config, description, status, created_by, approved_by, approved_at, created_at) values
('v1', '{"version":"v1","description":"Participant policy v1 - fictional motor claims triage","human_review":{"require_policy_active":true,"allowed_claim_types":["motor_own_damage"],"flag_fields":["injury_reported","liability_disputed","duplicate_flag","evidence_conflict"],"quote_limit_eur":1500,"review_repair_types":[]},"required_documents":["incident_report_present","itemized_quote_present"]}', 'Participant policy v1 - fictional motor claims triage', 'active', 'Tobias Brandt', 'Tobias Brandt', '2026-10-26T09:00:00Z', '2026-10-26T09:00:00Z');

insert into public.claims (case_id, case_status, claim_summary, policy_active_on_incident, claim_type, repair_type, quote_eur, incident_report_present, itemized_quote_present, injury_reported, liability_disputed, duplicate_flag, evidence_conflict, raw, received_at) values
('DEV-001', 'open', 'Single-car parking scrape; photos and itemized workshop quote.', true, 'motor_own_damage', 'standard', 650, true, true, false, false, false, false, '{"expected_v1":"routine_processing"}', '2026-11-04T07:00:00Z'),
('DEV-002', 'open', 'Minor bumper damage, but the incident report is missing.', true, 'motor_own_damage', 'standard', 750, false, true, false, false, false, false, '{"expected_v1":"request_information"}', '2026-11-02T07:00:00Z'),
('DEV-003', 'open', 'Repair quote is a total only; no line items.', true, 'motor_own_damage', 'standard', 890, true, false, false, false, false, false, '{"expected_v1":"request_information"}', '2026-11-03T10:17:00Z'),
('DEV-004', 'open', 'Repair estimate for bodywork exceeds the routine limit.', true, 'motor_own_damage', 'standard', 1800, true, true, false, false, false, false, '{"expected_v1":"human_review"}', '2026-11-05T12:23:00Z'),
('DEV-005', 'open', 'Incident date falls outside the active policy period.', false, 'motor_own_damage', 'standard', 400, true, true, false, false, false, false, '{"expected_v1":"human_review"}', '2026-11-06T07:46:00Z'),
('DEV-006', 'open', 'Driver reports an injury after the collision.', true, 'motor_own_damage', 'standard', 300, true, true, true, false, false, false, '{"expected_v1":"human_review"}', '2026-11-04T12:09:00Z'),
('DEV-007', 'open', 'Two drivers disagree about who caused the collision.', true, 'motor_own_damage', 'standard', 700, true, true, false, true, false, false, '{"expected_v1":"human_review"}', '2026-11-05T07:32:00Z'),
('DEV-008', 'open', 'Second submission with the same incident reference.', true, 'motor_own_damage', 'standard', 500, true, true, false, false, true, false, '{"expected_v1":"human_review"}', '2026-11-06T12:55:00Z'),
('DEV-009', 'open', 'Photo timestamp conflicts with the reported incident date.', true, 'motor_own_damage', 'standard', 600, true, true, false, false, false, true, '{"expected_v1":"human_review"}', '2026-11-04T07:18:00Z'),
('DEV-010', 'open', 'Straightforward claim at the original €1,500 boundary.', true, 'motor_own_damage', 'standard', 1500, true, true, false, false, false, false, '{"expected_v1":"routine_processing"}', '2026-11-05T12:41:00Z'),
('DEV-011', 'open', 'Electric vehicle battery housing repair; complete paperwork.', true, 'motor_own_damage', 'ev_high_voltage_battery', 900, true, true, false, false, false, false, '{"expected_v1":"routine_processing"}', '2026-11-06T07:04:00Z'),
('DEV-012', 'open', 'Routine panel replacement, but the claim concerns theft.', true, 'theft', 'standard', 700, true, true, false, false, false, false, '{"expected_v1":"human_review"}', '2026-11-04T12:27:00Z'),
('DEV-013', 'open', 'Panel repair; the quote amount is unreadable on the scanned document.', true, 'motor_own_damage', 'standard', null, true, true, false, false, false, false, '{"expected_v1":"request_information"}', '2026-11-02T13:34:00Z'),
('DEV-014', 'open', 'Injury reported; the incident-report field was left blank on the form.', true, 'motor_own_damage', 'standard', 350, null, true, true, false, false, false, '{"expected_v1":"human_review"}', '2026-11-05T07:50:00Z'),
('PRA-001', 'open', 'Windshield repair with complete evidence.', true, 'motor_own_damage', 'standard', 320, true, true, false, false, false, false, '{}', '2026-11-06T12:13:00Z'),
('PRA-002', 'open', 'Panel repair at €1,200 with complete evidence.', true, 'motor_own_damage', 'standard', 1200, true, true, false, false, false, false, '{}', '2026-11-04T07:36:00Z'),
('PRA-003', 'open', 'Panel repair at €1,201 with complete evidence.', true, 'motor_own_damage', 'standard', 1201, true, true, false, false, false, false, '{}', '2026-11-05T12:59:00Z'),
('PRA-004', 'open', 'Repair quote at €1,450, complete evidence.', true, 'motor_own_damage', 'standard', 1450, true, true, false, false, false, false, '{}', '2026-11-06T07:22:00Z'),
('PRA-005', 'open', 'EV high-voltage battery service at €700.', true, 'motor_own_damage', 'ev_high_voltage_battery', 700, true, true, false, false, false, false, '{}', '2026-11-04T12:45:00Z'),
('PRA-006', 'open', 'Battery service with no itemized quote.', true, 'motor_own_damage', 'ev_high_voltage_battery', 700, true, false, false, false, false, false, '{}', '2026-11-03T16:51:00Z'),
('PRA-007', 'open', 'Claimant reports injury; incident report missing.', true, 'motor_own_damage', 'standard', 800, false, true, true, false, false, false, '{}', '2026-11-05T07:08:00Z'),
('PRA-008', 'open', 'Damage looks routine, but policy had expired.', false, 'motor_own_damage', 'standard', 500, true, true, false, false, false, false, '{}', '2026-11-06T12:31:00Z'),
('PRA-009', 'closed', 'Closed claim at €1,350, complete evidence.', true, 'motor_own_damage', 'standard', 1350, true, true, false, false, false, false, '{}', '2026-11-04T07:54:00Z'),
('PRA-010', 'closed', 'Closed EV battery repair at €900.', true, 'motor_own_damage', 'ev_high_voltage_battery', 900, true, true, false, false, false, false, '{}', '2026-11-05T12:17:00Z'),
('PRA-011', 'open', 'Quote says €900; claim form says €1,900.', true, 'motor_own_damage', 'standard', 900, true, true, false, false, false, true, '{}', '2026-11-06T07:40:00Z'),
('PRA-012', 'open', 'New claim with missing incident report and itemized quote.', true, 'motor_own_damage', 'standard', 800, false, false, false, false, false, false, '{}', '2026-11-02T09:08:00Z');

insert into public.decisions (case_id, policy_version, recommendation, rule_id, explanation, missing_fields, created_at) values
('DEV-001', 'v1', 'routine_processing', 'v1.R3', 'All checks passed', '{}', '2026-11-04T07:01:12Z'),
('DEV-002', 'v1', 'request_information', 'v1.R2', 'Incident report missing', array['incident_report_present'], '2026-11-02T07:01:12Z'),
('DEV-003', 'v1', 'request_information', 'v1.R2', 'Itemized quote missing', array['itemized_quote_present'], '2026-11-03T10:18:12Z'),
('DEV-004', 'v1', 'human_review', 'v1.R1', '€1,800 is above the €1,500 limit', '{}', '2026-11-05T12:24:12Z'),
('DEV-005', 'v1', 'human_review', 'v1.R1', 'Policy not active on incident date', '{}', '2026-11-06T07:47:12Z'),
('DEV-006', 'v1', 'human_review', 'v1.R1', 'Injury reported', '{}', '2026-11-04T12:10:12Z'),
('DEV-007', 'v1', 'human_review', 'v1.R1', 'Disputed liability reported', '{}', '2026-11-05T07:33:12Z'),
('DEV-008', 'v1', 'human_review', 'v1.R1', 'Duplicate reported', '{}', '2026-11-06T12:56:12Z'),
('DEV-009', 'v1', 'human_review', 'v1.R1', 'Evidence conflict reported', '{}', '2026-11-04T07:19:12Z'),
('DEV-010', 'v1', 'routine_processing', 'v1.R3', 'All checks passed', '{}', '2026-11-05T12:42:12Z'),
('DEV-011', 'v1', 'routine_processing', 'v1.R3', 'All checks passed', '{}', '2026-11-06T07:05:12Z'),
('DEV-012', 'v1', 'human_review', 'v1.R1', 'Claim type "theft" needs a person', '{}', '2026-11-04T12:28:12Z'),
('DEV-013', 'v1', 'request_information', 'v1.BLANK', 'Quote amount unknown', array['quote_eur'], '2026-11-02T13:35:12Z'),
('DEV-014', 'v1', 'human_review', 'v1.R1', 'Injury reported', array['incident_report_present'], '2026-11-05T07:51:12Z'),
('PRA-001', 'v1', 'routine_processing', 'v1.R3', 'All checks passed', '{}', '2026-11-06T12:14:12Z'),
('PRA-002', 'v1', 'routine_processing', 'v1.R3', 'All checks passed', '{}', '2026-11-04T07:37:12Z'),
('PRA-003', 'v1', 'routine_processing', 'v1.R3', 'All checks passed', '{}', '2026-11-05T13:00:12Z'),
('PRA-004', 'v1', 'routine_processing', 'v1.R3', 'All checks passed', '{}', '2026-11-06T07:23:12Z'),
('PRA-005', 'v1', 'routine_processing', 'v1.R3', 'All checks passed', '{}', '2026-11-04T12:46:12Z'),
('PRA-006', 'v1', 'request_information', 'v1.R2', 'Itemized quote missing', array['itemized_quote_present'], '2026-11-03T16:52:12Z'),
('PRA-007', 'v1', 'human_review', 'v1.R1', 'Injury reported', array['incident_report_present'], '2026-11-05T07:09:12Z'),
('PRA-008', 'v1', 'human_review', 'v1.R1', 'Policy not active on incident date', '{}', '2026-11-06T12:32:12Z'),
('PRA-009', 'v1', 'routine_processing', 'v1.R3', 'All checks passed', '{}', '2026-11-04T07:55:12Z'),
('PRA-010', 'v1', 'routine_processing', 'v1.R3', 'All checks passed', '{}', '2026-11-05T12:18:12Z'),
('PRA-011', 'v1', 'human_review', 'v1.R1', 'Evidence conflict reported', '{}', '2026-11-06T07:41:12Z'),
('PRA-012', 'v1', 'request_information', 'v1.R2', 'Incident report missing. Itemized quote missing', array['incident_report_present','itemized_quote_present'], '2026-11-02T09:09:12Z');

insert into public.case_workflow (case_id, queue, assignee, qa_sample, sla_due_at, updated_at) values
('DEV-001', 'auto_processed', null, false, null, '2026-11-04T07:01:12Z'),
('DEV-002', 'waiting_customer', null, false, null, '2026-11-02T07:01:12Z'),
('DEV-003', 'waiting_customer', null, false, null, '2026-11-03T10:18:12Z'),
('DEV-004', 'on_you', 'Mara Klein', false, '2026-11-06T12:23:00Z', '2026-11-05T12:24:12Z'),
('DEV-005', 'on_you', 'Jonas Weber', false, '2026-11-07T07:46:00Z', '2026-11-06T07:47:12Z'),
('DEV-006', 'on_you', 'Lea Hoffmann', false, '2026-11-05T12:09:00Z', '2026-11-04T12:10:12Z'),
('DEV-007', 'on_you', 'Mara Klein', false, '2026-11-06T07:32:00Z', '2026-11-05T07:33:12Z'),
('DEV-008', 'on_you', null, false, '2026-11-07T12:55:00Z', '2026-11-06T12:56:12Z'),
('DEV-009', 'on_you', 'Jonas Weber', false, '2026-11-05T07:18:00Z', '2026-11-04T07:19:12Z'),
('DEV-010', 'auto_processed', null, false, null, '2026-11-05T12:42:12Z'),
('DEV-011', 'auto_processed', null, false, null, '2026-11-06T07:05:12Z'),
('DEV-012', 'on_you', 'Lea Hoffmann', false, '2026-11-05T12:27:00Z', '2026-11-04T12:28:12Z'),
('DEV-013', 'waiting_customer', null, false, null, '2026-11-02T13:35:12Z'),
('DEV-014', 'on_you', 'Mara Klein', false, '2026-11-06T07:50:00Z', '2026-11-05T07:51:12Z'),
('PRA-001', 'auto_processed', 'Mara Klein', true, '2026-11-07T12:13:00Z', '2026-11-06T12:14:12Z'),
('PRA-002', 'auto_processed', null, false, null, '2026-11-04T07:37:12Z'),
('PRA-003', 'auto_processed', null, false, null, '2026-11-05T13:00:12Z'),
('PRA-004', 'auto_processed', null, false, null, '2026-11-06T07:23:12Z'),
('PRA-005', 'auto_processed', null, false, null, '2026-11-04T12:46:12Z'),
('PRA-006', 'waiting_customer', null, false, null, '2026-11-03T16:52:12Z'),
('PRA-007', 'on_you', 'Jonas Weber', false, '2026-11-06T07:08:00Z', '2026-11-05T07:09:12Z'),
('PRA-008', 'on_you', 'Lea Hoffmann', false, '2026-11-07T12:31:00Z', '2026-11-06T12:32:12Z'),
('PRA-009', 'done', null, false, null, '2026-11-04T07:55:12Z'),
('PRA-010', 'done', null, false, null, '2026-11-05T12:18:12Z'),
('PRA-011', 'on_you', null, false, '2026-11-07T07:40:00Z', '2026-11-06T07:41:12Z'),
('PRA-012', 'waiting_customer', null, false, null, '2026-11-02T09:09:12Z');

insert into public.outreach (case_id, channel, missing_items, status, sent_at, last_reminder_at, reminder_count) values
('DEV-002', 'email', array['incident_report_present'], 'reminded', '2026-11-02T07:03:00Z', '2026-11-06T07:03:00Z', 2),
('DEV-003', 'email', array['itemized_quote_present'], 'reminded', '2026-11-03T10:20:00Z', '2026-11-07T10:20:00Z', 2),
('DEV-013', 'email', array['quote_eur'], 'reminded', '2026-11-02T13:37:00Z', '2026-11-06T13:37:00Z', 2),
('PRA-006', 'email', array['itemized_quote_present'], 'reminded', '2026-11-03T16:54:00Z', '2026-11-05T16:54:00Z', 1),
('PRA-012', 'email', array['incident_report_present','itemized_quote_present'], 'reminded', '2026-11-02T09:11:00Z', '2026-11-06T09:11:00Z', 2);

do $$
declare
  c record;
  i int := 0;
  names text[] := array['Anna Becker','Lukas Schmidt','Sophie Wagner','Felix Braun','Emma Fischer','Paul Schulz','Mia Neumann','Leon Richter','Hannah Wolf','Jonas Krüger','Lena Zimmermann','Tim Hartmann','Laura Schäfer','Max Koch','Clara Bauer','David Lange','Julia Klein','Moritz Hahn','Nina Vogel','Simon Frank','Marie Roth','Tobias Kaiser','Lisa Busch','Erik Lorenz','Sarah Peters','Jan Albrecht'];
  plates text[] := array['M-AK 1000','B-BR 4779','HH-CY 8558','K-DQ 3338','F-EX 7117','S-FP 1897','D-GW 5676','DO-HO 9455','E-IV 4235','L-JN 8014','HB-KU 2794','H-LM 6573','N-MT 1353','DU-NL 5132','BO-OS 8911','W-PK 3691','BI-QR 7470','BN-RY 2250','MS-SQ 6029','KA-TX 9808','MA-UP 4588','A-VW 8367','WI-WO 3147','GE-XV 6926','MG-YN 1706','KI-ZU 5485'];
  phone boolean;
  amt text;
  form_amt text;
  ch text;
  tr jsonb;
  fm jsonb;
  docs jsonb;
  ans_inj text; ans_lia text; ans_ir text; ans_q text;
  sys_pol text; sys_dup text; sys_ev text;
  ev_quote text;
  src text; r_inj text; r_lia text; r_ir text; r_ct text; r_rt text;
  q_inj text; q_lia text; q_ir text; q_ct text; q_rt text;
  d record; w record; o record; rem int;
begin
  for c in select * from public.claims order by case_id loop
    i := i + 1;
    phone := c.case_id in ('DEV-006','DEV-014','PRA-007','PRA-012','DEV-002');
    ch := case when phone then 'phone' else 'online_form' end;
    amt := case when c.quote_eur is null then null else '€' || to_char(c.quote_eur, 'FM999,999,990') end;
    form_amt := case when c.case_id = 'PRA-011' then '€1,900' else amt end;

    sys_pol := case when c.policy_active_on_incident is null then 'No match in policy register' when c.policy_active_on_incident then 'Policy active on incident date' else 'No active policy on incident date' end;
    sys_dup := case when c.duplicate_flag is null then 'Duplicate check not run' when c.duplicate_flag then 'Same incident reference already submitted' else 'No duplicate found' end;
    ev_quote := case when c.case_id = 'PRA-011' then 'Form amount €1,900 ≠ quote document €900' else 'Evidence conflicts with the reported facts' end;
    sys_ev := case when c.evidence_conflict is null then 'Evidence check not run' when c.evidence_conflict then ev_quote else 'Evidence consistent' end;

    docs := jsonb_build_array(
      jsonb_build_object('name','incident_report.pdf','kind','incident_report',
        'status', case when c.incident_report_present is null then 'unknown' when c.incident_report_present then 'present' else 'missing' end,
        'note', case when c.incident_report_present is null then 'Not stated' when c.incident_report_present then 'Received' else 'Not received' end),
      jsonb_build_object('name','quote.pdf','kind','quote',
        'status', case when c.itemized_quote_present is null then 'unknown' when c.itemized_quote_present then 'present' else 'incomplete' end,
        'note', (case when c.itemized_quote_present is null then 'Itemization unknown' when c.itemized_quote_present then 'Itemized' else 'Total only' end) || ' · ' || coalesce(amt, 'amount unreadable')),
      jsonb_build_object('name','photos.zip','kind','photos','status','present','note','Damage photos'));

    tr := null; fm := null;
    if phone then
      ans_inj := case when c.injury_reported is null then 'I don''t know yet.' when c.injury_reported then 'Yes, someone was injured.' else 'No, nobody was injured.' end;
      ans_lia := case when c.liability_disputed is null then 'I don''t know yet.' when c.liability_disputed then 'Yes, the other driver disputes it.' else 'No, nobody disputes it.' end;
      ans_ir := case when c.incident_report_present is null then 'I don''t know yet.' when c.incident_report_present then 'Yes, I have it.' else 'No, I don''t have one.' end;
      ans_q := case when c.quote_eur is null then 'I have a quote, but I can''t read the amount.'
        else 'Yes, ' || amt || case when c.itemized_quote_present is null then ', not sure if it''s itemized.' when c.itemized_quote_present then ', with line items.' else ', but it''s a total only.' end end;
      tr := jsonb_build_array(
        jsonb_build_object('line',1,'speaker','agent','text','Hello, this is the claims line. Which vehicle is this about? Please tell me the plate.'),
        jsonb_build_object('line',2,'speaker','customer','text','It''s ' || plates[i] || '.'),
        jsonb_build_object('line',3,'speaker','system','text', case when c.policy_active_on_incident is null then 'Policy register: no match yet.' when c.policy_active_on_incident then 'Policy register: policy active on incident date.' else 'Policy register: no active policy on incident date.' end),
        jsonb_build_object('line',4,'speaker','agent','text','Thank you. What happened?'),
        jsonb_build_object('line',5,'speaker','customer','text', regexp_replace(coalesce(c.claim_summary,''), '\.$', '') || '. It''s my own car, ' || case when c.repair_type = 'ev_high_voltage_battery' then 'the high-voltage battery needs work.' else 'a standard repair.' end),
        jsonb_build_object('line',6,'speaker','agent','text','Was anyone injured?'),
        jsonb_build_object('line',7,'speaker','customer','text',ans_inj),
        jsonb_build_object('line',8,'speaker','agent','text','Is there any disagreement about who caused it?'),
        jsonb_build_object('line',9,'speaker','customer','text',ans_lia),
        jsonb_build_object('line',10,'speaker','agent','text','Do you have an incident report?'),
        jsonb_build_object('line',11,'speaker','customer','text',ans_ir),
        jsonb_build_object('line',12,'speaker','agent','text','Do you have a repair quote? What''s the amount, and is it itemized or a total only?'),
        jsonb_build_object('line',13,'speaker','customer','text',ans_q),
        jsonb_build_object('line',14,'speaker','system','text','Duplicate check: ' || case when c.duplicate_flag is null then 'not run' when c.duplicate_flag then 'same incident reference found' else 'no match' end || '. Evidence check: ' || case when c.evidence_conflict is null then 'not run' when c.evidence_conflict then 'conflict found' else 'consistent' end || '.'),
        jsonb_build_object('line',15,'speaker','agent','text','Thanks, I''ve noted everything. I''ll send you an upload link by SMS.'));
      src := 'transcript';
      r_ct := 'line 5'; r_rt := 'line 5'; r_inj := 'line 7'; r_lia := 'line 9'; r_ir := 'line 11';
      q_ct := tr->4->>'text'; q_rt := q_ct; q_inj := ans_inj; q_lia := ans_lia; q_ir := ans_ir;
    else
      fm := jsonb_build_array(
        jsonb_build_object('field',1,'label','Plate','value',plates[i]),
        jsonb_build_object('field',2,'label','Claim type','value',c.claim_type),
        jsonb_build_object('field',3,'label','What happened','value',c.claim_summary),
        jsonb_build_object('field',4,'label','Repair type','value',c.repair_type),
        jsonb_build_object('field',5,'label','Anyone injured?','value', case when c.injury_reported is null then null when c.injury_reported then 'Yes' else 'No' end),
        jsonb_build_object('field',6,'label','Fault disputed?','value', case when c.liability_disputed is null then null when c.liability_disputed then 'Yes' else 'No' end),
        jsonb_build_object('field',7,'label','Incident report attached?','value', case when c.incident_report_present is null then null when c.incident_report_present then 'Yes' else 'No' end),
        jsonb_build_object('field',8,'label','Quote attached?','value', case when c.itemized_quote_present is null then null when c.itemized_quote_present then 'Itemized' else 'Total only' end),
        jsonb_build_object('field',9,'label','Quote amount','value',form_amt));
      src := 'form';
      r_ct := 'field 2'; r_rt := 'field 4'; r_inj := 'field 5'; r_lia := 'field 6'; r_ir := 'field 7';
      q_ct := 'Claim type ' || coalesce(c.claim_type,'(empty)');
      q_rt := 'Repair type ' || coalesce(c.repair_type,'(empty)');
      q_inj := 'Anyone injured? ' || coalesce(fm->4->>'value','(empty)');
      q_lia := 'Fault disputed? ' || coalesce(fm->5->>'value','(empty)');
      q_ir := 'Incident report attached? ' || coalesce(fm->6->>'value','(empty)');
    end if;

    insert into public.claim_intake (case_id, channel, customer_name, plate, received_at, transcript, form, documents)
    values (c.case_id, ch, names[i], plates[i], c.received_at, tr, fm, docs);

    insert into public.fact_sources (case_id, field, source_type, ref, quote, confidence) values
      (c.case_id, 'claim_type', src, r_ct, q_ct, case when c.claim_type is null then 'unconfirmed' else 'confirmed' end),
      (c.case_id, 'repair_type', src, r_rt, q_rt, case when c.repair_type is null then 'unconfirmed' else 'confirmed' end),
      (c.case_id, 'injury_reported', src, r_inj, q_inj, case when c.injury_reported is null then 'unconfirmed' else 'confirmed' end),
      (c.case_id, 'liability_disputed', src, r_lia, q_lia, case when c.liability_disputed is null then 'unconfirmed' else 'confirmed' end),
      (c.case_id, 'itemized_quote_present', 'document', 'quote.pdf', case when c.itemized_quote_present is null then 'Itemization unknown' when c.itemized_quote_present then 'Quote lists line items' else 'Quote shows a total only' end, case when c.itemized_quote_present is null then 'unconfirmed' else 'confirmed' end),
      (c.case_id, 'quote_eur', 'document', 'quote.pdf', coalesce('Total ' || amt, 'Amount unreadable'), case when c.quote_eur is null then 'unconfirmed' else 'confirmed' end),
      (c.case_id, 'policy_active_on_incident', 'system', case when phone then 'line 3 · policy register' else 'policy register' end, sys_pol, case when c.policy_active_on_incident is null then 'unconfirmed' else 'confirmed' end),
      (c.case_id, 'duplicate_flag', 'system', case when phone then 'line 14 · duplicate check' else 'duplicate check' end, sys_dup, case when c.duplicate_flag is null then 'unconfirmed' else 'confirmed' end),
      (c.case_id, 'evidence_conflict', 'system', case when phone then 'line 14 · evidence check' else 'evidence check' end, sys_ev, case when c.evidence_conflict is null then 'unconfirmed' else 'confirmed' end);
    if c.incident_report_present is null then
      insert into public.fact_sources (case_id, field, source_type, ref, quote, confidence) values (c.case_id, 'incident_report_present', src, r_ir, q_ir, 'unconfirmed');
    else
      insert into public.fact_sources (case_id, field, source_type, ref, quote, confidence) values (c.case_id, 'incident_report_present', 'document', 'incident_report.pdf', case when c.incident_report_present then 'Incident report received' else 'No incident report received' end, 'confirmed');
    end if;

    select * into d from public.decisions where case_id = c.case_id and is_current limit 1;
    select * into w from public.case_workflow where case_id = c.case_id;
    insert into public.case_events (case_id, type, actor, payload, created_at) values
      (c.case_id, 'received', case when phone then 'Voice agent' else 'Online form' end, jsonb_build_object('channel', ch), c.received_at),
      (c.case_id, 'triaged', 'Rules engine', jsonb_build_object('recommendation', d.recommendation, 'rule_id', d.rule_id, 'policy_version', d.policy_version), d.created_at);
    if w.qa_sample then
      insert into public.case_events (case_id, type, actor, payload, created_at) values (c.case_id, 'qa_sampled', 'Rules engine', '{}', d.created_at + interval '1 minute');
    end if;
    if w.assignee is not null then
      insert into public.case_events (case_id, type, actor, payload, created_at) values (c.case_id, 'assigned', 'Rules engine', jsonb_build_object('assignee', w.assignee), d.created_at + interval '2 minutes');
    end if;
    for o in select * from public.outreach where case_id = c.case_id loop
      insert into public.case_events (case_id, type, actor, payload, created_at) values (c.case_id, 'outreach_sent', 'Rules engine', jsonb_build_object('channel', o.channel, 'missing_items', to_jsonb(o.missing_items)), o.sent_at);
      for rem in 1..o.reminder_count loop
        insert into public.case_events (case_id, type, actor, payload, created_at) values (c.case_id, 'reminder_sent', 'Rules engine', jsonb_build_object('reminder', rem), o.sent_at + (rem * 48) * interval '1 hour');
      end loop;
    end loop;
    if w.queue = 'done' then
      insert into public.case_events (case_id, type, actor, payload, created_at) values (c.case_id, 'closed', 'Claims system', '{}', c.received_at + interval '2 hours');
    end if;
  end loop;
end $$;
