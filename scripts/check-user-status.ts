/**
 * Check current user status and provide guidance for admin conversion
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const USER_UID = '274548aa-9b53-45c0-92a2-8374244d9641';

async function checkUserStatus() {
  console.log('🔍 Checking your MedBookAi account status...\n');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log('❌ Error: Missing database credentials');
    console.log('Please set these environment variables:');
    console.log('  SUPABASE_URL=your-project-url');
    console.log('  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key\n');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    // Check if user exists
    const { data: userData, error: userError } = await supabase
      .from('auth.users')
      .select('id, email, created_at')
      .eq('id', USER_UID)
      .single();

    if (userError) {
      console.log('❌ User not found in database');
      console.log('User UID: 274548aa-9b53-45c0-92a2-8374244d9641\n');
      console.log('Troubleshooting:');
      console.log('1. Make sure you are logged in to MedBookAi');
      console.log('2. Check if your User UID is correct');
      console.log('3. Try logging out and back in to refresh your session\n');
      return;
    }

    console.log('✅ User found in database:');
    console.log(`   Email: ${userData.email}`);
    console.log(`   User ID: ${userData.id}`);
    console.log(`   Created: ${userData.created_at}\n`);

    // Check clinic membership
    const { data: membership, error: membershipError } = await supabase
      .from('clinic_members')
      .select(`
        *,
        clinics:clinics(id, name, slug, created_by)
      `)
      .eq('user_id', USER_UID)
      .single();

    if (membershipError) {
      console.log('❌ User has no clinic membership');
      console.log('Troubleshooting:');
      console.log('1. You need to join or create a clinic first');
      console.log('2. Contact your clinic administrator');
      console.log('3. You might need to complete onboarding\n');
      return;
    }

    console.log('✅ Clinic membership found:');
    console.log(`   Clinic: ${membership.clinics?.name || 'Unknown'}`);
    console.log(`   Clinic ID: ${membership.clinic_id}`);
    console.log(`   Current Role: ${membership.role}\n`);

    // Check subscription
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('plan_id, status, current_period_start, current_period_end')
      .eq('clinic_id', membership.clinic_id!)
      .single();

    if (subError) {
      console.log('ℹ️  No active subscription found');
      console.log('   You might be on a free trial or no billing plan\n');
    } else {
      console.log('✅ Subscription status:');
      console.log(`   Plan: ${subscription.plan_id}`);
      console.log(`   Status: ${subscription.status}`);
      console.log(`   Period: ${subscription.current_period_start} to ${subscription.current_period_end}\n`);
    }

    // Check platform admin status
    const { data: platformAdmin, error: paError } = await supabase
      .from('platform_admins')
      .select('*')
      .eq('user_id', USER_UID)
      .single();

    if (paError) {
      console.log('ℹ️  Not a platform admin');
      console.log('   Platform admins have access to: /app/admin/* routes\n');
    } else {
      console.log('✅ Platform admin status:');
      console.log(`   Created: ${platformAdmin.created_at}\n`);
    }

    // Provide next steps
    console.log('📋 Next steps to get admin access:');
    console.log('\n1️⃣  Choose your admin role:');
    console.log('   - "owner": Full access including patient deletion');
    console.log('   - "clinic_admin": Full access except patient deletion (recommended)');
    console.log('   - "admin": Legacy admin role\n');

    console.log('2️⃣  To convert to admin, you have two options:\n');
    console.log('   Option A: Use Supabase SQL Editor');
    console.log('   - Go to Supabase dashboard → SQL Editor');
    console.log('   - Run: UPDATE public.clinic_members SET role = "clinic_admin" WHERE user_id = "274548aa-9b53-45c0-92a2-8374244d9641" AND clinic_id = "' + membership.clinic_id + '";\n');
    console.log('   Option B: Use the make-admin script');
    console.log('   - Install dependencies: npm install @supabase/supabase-js');
    console.log('   - Set credentials and run: npx tsx scripts/make-admin.ts\n');

    console.log('3️⃣  After conversion:');
    console.log('   - Refresh your browser');
    console.log('   - You should see all admin modules in the sidebar');
    console.log('   - Navigate to Settings to configure clinic\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error('\n📋 Troubleshooting:');
    console.error('1. Check your database credentials');
    console.error('2. Verify the User UID is correct: 274548aa-9b53-45c0-92a2-8374244d9641');
    console.error('3. Ensure you have service role privileges');
    console.error('4. Check that Supabase database is running\n');
  }
}

// Run the check
checkUserStatus();
