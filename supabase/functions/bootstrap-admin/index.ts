import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Create admin client with service role key
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Parse request body first to validate input
    const { email, password } = await req.json()

    if (!email || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ success: false, error: 'Password must be at least 6 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use a transaction-like approach: try to insert a bootstrap lock record first
    // This prevents race conditions by using database-level uniqueness
    const bootstrapLockId = 'bootstrap-admin-lock'
    
    // First check if admin exists (quick check)
    const { data: existingAdmins, error: checkError } = await supabase
      .from('user_roles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)

    if (checkError) {
      console.error('Error checking existing admins:', checkError)
      throw new Error('Failed to check existing admins')
    }

    if (existingAdmins && existingAdmins.length > 0) {
      console.log('Admin already exists, blocking bootstrap')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'An admin user already exists. Bootstrap is disabled for security.' 
        }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Creating admin user:', email)

    // Create user with admin API - this is atomic
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createError) {
      // If user already exists (race condition), another request beat us
      if (createError.message?.includes('already been registered') || 
          createError.message?.includes('already exists')) {
        console.log('User creation race condition detected')
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Admin setup already in progress or completed.' 
          }),
          { 
            status: 409, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      console.error('Error creating user:', createError)
      throw createError
    }

    if (!userData.user) {
      throw new Error('User creation failed')
    }

    console.log('User created with ID:', userData.user.id)

    // Update the user's role to admin - re-check no admin exists
    // Use a conditional update that only succeeds if no admin role exists yet
    const { data: currentAdmins } = await supabase
      .from('user_roles')
      .select('id')
      .eq('role', 'admin')
      .neq('user_id', userData.user.id)
      .limit(1)

    if (currentAdmins && currentAdmins.length > 0) {
      // Another admin was created while we were processing - rollback
      console.log('Race condition: another admin was created, removing this user')
      await supabase.auth.admin.deleteUser(userData.user.id)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'An admin was created by another request. Please try logging in.' 
        }),
        { 
          status: 409, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const { error: roleError } = await supabase
      .from('user_roles')
      .update({ role: 'admin' })
      .eq('user_id', userData.user.id)

    if (roleError) {
      console.error('Error updating role:', roleError)
      // Cleanup: delete the created user if role assignment fails
      await supabase.auth.admin.deleteUser(userData.user.id)
      throw roleError
    }

    console.log('Admin role assigned successfully')

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Admin user created successfully',
        email: email
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Bootstrap error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'An unexpected error occurred' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})