/**
 * Programmatic way to convert your account to admin
 * This script connects to your Supabase database and updates your role
 */

import { createClient } from '@supabase/supabase-js';

// Your Supabase credentials
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const USER_UID = '274548aa-9b53-45c0-92a2-8374244d9641';

async function makeAdmin() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    console.log('🔍 Step 1: Checking current membership...\n');

    // Check current membership
    const { data: membership, error: membershipError } = await supabase
      .from('clinic_members')
      .select(`
        *,
        clinics:clinics(name, slug)
      `)
      .eq('user_id', USER_UID)
      .single();

    if (membershipError) {
      throw new Error(`Membership check failed: ${membershipError.message}`);
    }

    console.log('✅ Current membership found:');
    console.log(`   Clinic: ${membership.clinics?.name || 'Unknown'}`);
    console.log(`   Clinic ID: ${membership.clinic_id}`);
    console.log(`   Current Role: ${membership.role}`);
    console.log(`   User Email: ${membership.email}\n`);

    console.log('🔐 Step 2: Updating role to clinic_admin...\n');

    // Update role to clinic_admin
    const { data: updateData, error: updateError } = await supabase
      .from('clinic_members')
      .update({
        role: 'clinic_admin',
        permissions: {} as Record<string, boolean>,
      })
      .eq('user_id', USER_UID)
      .eq('clinic_id', membership.clinic_id!)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Role update failed: ${updateError.message}`);
    }

    console.log('✅ Role updated successfully!');
    console.log(`   New Role: ${updateData.role}`);
    console.log(`   Permissions: ${JSON.stringify(updateData.permissions)}\n`);

    console.log('📊 Step 3: Verifying update...\n');

    // Verify the update
    const { data: verifiedMembership, error: verifiedError } = await supabase
      .from('clinic_members')
      .select('*')
      .eq('user_id', USER_UID)
      .eq('clinic_id', membership.clinic_id!)
      .single();

    if (verifiedError) {
      throw new Error(`Verification failed: ${verifiedError.message}`);
    }

    console.log('✅ Verification successful!');
    console.log(`   Final Role: ${verifiedMembership.role}`);
    console.log(`   Final Permissions: ${JSON.stringify(verifiedMembership.permissions)}\n`);

    console.log('🎉 All done! You now have admin privileges.');
    console.log('\n💡 Note: Permissions are inherited from your role.');
    console.log('   To see all available permissions, check lib/auth/rbac-config.ts\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error('\n📋 Troubleshooting tips:');
    console.error('1. Make sure SUPABASE_SERVICE_ROLE_KEY has admin privileges');
    console.error('2. Check that USER_UID is correct: 274548aa-9b53-45c0-92a2-8374244d9641');
    console.error('3. Verify your database connection is working');
  }
}

// Run the script
makeAdmin();
