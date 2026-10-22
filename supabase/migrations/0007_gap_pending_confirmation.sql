-- G (user, 22/10): a participation left on the catalog default is waiting for the car team's confirmation, not a
-- question that was sent. It gets its own type, so "הופנה לצוות הרכב" means an actual askRepresentative question.
alter table public.information_gaps drop constraint information_gaps_type_check;
alter table public.information_gaps add constraint information_gaps_type_check
  check (type in ('no_data', 'referred_to_rep', 'pending_confirmation', 'unknown_vehicle'));
alter table public.information_gap_status drop constraint information_gap_status_type_check;
alter table public.information_gap_status add constraint information_gap_status_type_check
  check (type in ('no_data', 'referred_to_rep', 'pending_confirmation', 'unknown_vehicle'));

-- Rows written before this split: the catalog-default gaps carry their fixed description (src/lib/gaps/derive.ts).
update public.information_gaps set type = 'pending_confirmation'
where type = 'referred_to_rep' and description = 'השתתפות עצמית לא אושרה ברכב: נעשה שימוש בברירת המחדל מהקטלוג';
