-- Collapse v0.5 + v0.6 roadmap phases into v0.
-- Goal: simplify Command Center to a single v0 phase. Pre-existing rows that
-- still reference 'v0.5' or 'v0.6' would otherwise become orphans (UI shows
-- 6 phase-cards now; rows with old phase-keys can't be edited via the
-- dropdowns). cc_tasks.roadmap_phase has no CHECK-constraint, so this is a
-- pure data-fix migration.

update cc_tasks      set roadmap_phase = 'v0' where roadmap_phase in ('v0.5', 'v0.6');
update cc_milestones set roadmap_phase = 'v0' where roadmap_phase in ('v0.5', 'v0.6');
delete from cc_phase_status where phase in ('v0.5', 'v0.6');
