# Deployment Checklist: Payment Schedules System

Use this checklist when deploying the payment schedules system to ensure nothing is missed.

## Pre-Deployment

### Code Review
- [ ] All migration files reviewed and understood
- [ ] Service layer code reviewed
- [ ] Type definitions reviewed
- [ ] Documentation reviewed
- [ ] Sample implementations reviewed

### Testing Preparation
- [ ] Test environment prepared (local Supabase or staging)
- [ ] Test data available (sample billers, installments)
- [ ] Rollback plan documented
- [ ] Team notified of deployment

### Backup
- [ ] Database backup created
- [ ] Current schema documented
- [ ] Existing data exported (if needed)

## Deployment Steps

### Phase 1: Database Setup (Critical Path)

**⚠️ IMPORTANT: See HOW_TO_RUN_MIGRATIONS.md for detailed instructions!**

**Do these in exact order:**

0. [ ] **Migration 0 (NEW!):** Run `20260100_create_base_tables.sql` ⭐ **CRITICAL**
   - [ ] Creates base tables: accounts, billers, installments, savings, transactions
   - [ ] Verify: `SELECT COUNT(*) FROM pg_tables WHERE schemaname='public' AND tablename IN ('accounts','billers','installments','savings','transactions')`
   - [ ] Should return 5
   - **If this fails, STOP! Nothing else will work.**

1. [ ] **Migration 1:** Run `20260130_create_budget_setups_table.sql`
   - [ ] Verify table created: `\d budget_setups`

2. [ ] **Migration 2:** Run `20260131_add_linked_account_to_billers.sql`
   - [ ] Verify column added: `\d billers`

3. [ ] **Migration 3:** Run `20260131_add_installment_timing.sql`
   - [ ] Verify column added: `\d installments`

4. [ ] **Migration 4:** Run `20260201_create_payment_schedules_table.sql`
   - [ ] Verify table created: `\d payment_schedules`
   - [ ] Verify indexes created
   - [ ] Verify triggers created

5. [ ] **Migration 5:** Run `20260201_add_payment_schedule_to_transactions.sql`
   - [ ] Verify column added: `\d transactions`
   - [ ] Verify unique index created
   - [ ] Test index: `\di idx_transactions_unique_payment_schedule`

6. [ ] **Backfill 1 (Optional):** Run `20260201_backfill_biller_schedules.sql`
   - [ ] Only if you have existing biller data
   - [ ] Review output for errors
   - [ ] Verify count: `SELECT COUNT(*) FROM payment_schedules WHERE biller_id IS NOT NULL`
   - [ ] Spot-check 5 billers manually

7. [ ] **Backfill 2 (Optional):** Run `20260201_backfill_installment_schedules.sql`
   - [ ] Only if you have existing installment data
   - [ ] Review output for errors
   - [ ] Verify count: `SELECT COUNT(*) FROM payment_schedules WHERE installment_id IS NOT NULL`
   - [ ] Spot-check 5 installments manually

**⚠️ STOP HERE if any step fails. Troubleshoot before continuing.**

### Phase 2: Verification

5. [ ] Run all queries from TESTING_GUIDE.md section 1
   - [ ] Tables exist
   - [ ] Constraints exist
   - [ ] Indexes exist
   - [ ] Foreign keys work

6. [ ] Run verification queries
   - [ ] No orphaned schedules
   - [ ] No schedules without parents
   - [ ] All billers have schedules
   - [ ] All installments have schedules

7. [ ] Test sample queries
   - [ ] Can fetch schedules by biller
   - [ ] Can fetch schedules by installment
   - [ ] Can fetch unpaid schedules
   - [ ] Query performance acceptable

### Phase 3: Code Deployment

8. [ ] Deploy application code
   - [ ] Code builds successfully
   - [ ] No TypeScript errors
   - [ ] No import errors
   - [ ] Services export correctly

9. [ ] Verify auto-generation works
   - [ ] Create test biller
   - [ ] Verify schedules created
   - [ ] Create test installment
   - [ ] Verify schedules created

10. [ ] Test service functions
    - [ ] `getPaymentSchedulesByBiller()` works
    - [ ] `markPaymentScheduleAsPaid()` works
    - [ ] `createTransaction()` with schedule_id works

## Post-Deployment

### Immediate Checks (First 15 minutes)

11. [ ] Application starts successfully
12. [ ] No errors in logs
13. [ ] No errors in browser console
14. [ ] Existing billers display correctly
15. [ ] Existing installments display correctly

### Functional Tests (First hour)

16. [ ] Create new biller
    - [ ] Saves successfully
    - [ ] Schedules auto-generated
    - [ ] Displays correctly

17. [ ] Create new installment
    - [ ] Saves successfully
    - [ ] Schedules auto-generated
    - [ ] Displays correctly

18. [ ] View existing biller
    - [ ] Schedules display
    - [ ] Payment status correct
    - [ ] Can view details

19. [ ] View existing installment
    - [ ] Schedules display
    - [ ] Progress correct
    - [ ] Can view details

### Data Integrity (First 24 hours)

20. [ ] Run daily health check query
21. [ ] Verify no orphaned schedules
22. [ ] Verify no duplicate transactions
23. [ ] Verify foreign keys enforced
24. [ ] Check for any errors in logs

### User Acceptance (First week)

25. [ ] Users can create billers
26. [ ] Users can create installments
27. [ ] Users can view schedules
28. [ ] No duplicate payment issues reported
29. [ ] No data loss reported
30. [ ] Performance acceptable

## Monitoring (Ongoing)

### Daily (First Week)
- [ ] Check error logs
- [ ] Run health check query
- [ ] Verify new items get schedules
- [ ] Check for any user-reported issues

### Weekly (First Month)
- [ ] Review payment schedule counts
- [ ] Check database performance
- [ ] Review transaction linkage
- [ ] Verify constraint effectiveness

### Monthly (Ongoing)
- [ ] Review and archive old schedules
- [ ] Check database size growth
- [ ] Review query performance
- [ ] Plan for backfill script removal

## Rollback Plan

### If Critical Issues Found

**Before UI Migration (Current State):**
1. [ ] Revert application code (if needed)
2. [ ] Database remains - no data loss
3. [ ] System falls back to JSON schedules
4. [ ] Investigate and fix issues
5. [ ] Re-deploy when ready

**To Completely Rollback Database:**
1. [ ] Drop foreign key from transactions:
   ```sql
   ALTER TABLE transactions DROP CONSTRAINT transactions_payment_schedule_id_fkey;
   ```
2. [ ] Drop column from transactions:
   ```sql
   ALTER TABLE transactions DROP COLUMN payment_schedule_id;
   ```
3. [ ] Drop payment_schedules table:
   ```sql
   DROP TABLE payment_schedules CASCADE;
   ```
4. [ ] Restore from backup if needed

**⚠️ Note:** Only use full rollback if absolutely necessary. System is designed to be backward compatible.

## Success Criteria

Deployment is successful when:

✅ All migrations ran without errors  
✅ All backfills completed successfully  
✅ Application builds and runs  
✅ New billers get schedules automatically  
✅ New installments get schedules automatically  
✅ No errors in logs  
✅ No user-reported issues  
✅ Performance is acceptable  
✅ Data integrity maintained  

## Known Issues / Limitations

Document any known issues here:

- [ ] Issue 1: ___________________________________
- [ ] Issue 2: ___________________________________
- [ ] Issue 3: ___________________________________

## Future Work

After successful deployment:

- [ ] Schedule UI migration (optional)
- [ ] Plan enhanced features (reminders, reports)
- [ ] Schedule backfill script removal (1-2 months)
- [ ] Consider performance optimizations
- [ ] Add automated tests

## Sign-Off

Deployment completed by: _______________________  
Date: _______________________  
Environment: _______________________  
Issues encountered: _______________________  
Status: [ ] Success  [ ] Success with issues  [ ] Failed  

## Notes

Use this section for any deployment-specific notes:

---
---
---

## Quick Command Reference

### Check Tables
```sql
\d payment_schedules
\d transactions
```

### Count Records
```sql
SELECT COUNT(*) FROM payment_schedules;
SELECT COUNT(*) FROM payment_schedules WHERE biller_id IS NOT NULL;
SELECT COUNT(*) FROM payment_schedules WHERE installment_id IS NOT NULL;
```

### Check Constraints
```sql
SELECT conname FROM pg_constraint WHERE conrelid = 'payment_schedules'::regclass;
```

### Check Indexes
```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'payment_schedules';
```

### Health Check
```sql
SELECT 
  COUNT(*) FILTER (WHERE biller_id IS NOT NULL) as biller_schedules,
  COUNT(*) FILTER (WHERE installment_id IS NOT NULL) as installment_schedules,
  COUNT(*) FILTER (WHERE amount_paid IS NOT NULL) as paid_schedules,
  COUNT(*) FILTER (WHERE amount_paid IS NULL) as unpaid_schedules
FROM payment_schedules;
```

### Find Issues
```sql
-- Orphaned schedules (should be 0)
SELECT COUNT(*) FROM payment_schedules ps
LEFT JOIN billers b ON ps.biller_id = b.id
LEFT JOIN installments i ON ps.installment_id = i.id
WHERE (ps.biller_id IS NOT NULL AND b.id IS NULL)
   OR (ps.installment_id IS NOT NULL AND i.id IS NULL);
```

---

**Document Version:** 1.0  
**Last Updated:** February 1, 2026  
**Status:** Ready for Use
