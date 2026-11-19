<?php
// config.example.php — copy to config.php and fill in your Supabase credentials.
// This file is NOT committed to git (config.php is gitignored via .gitignore).

return [
    // Your Supabase project URL (from Settings → API)
    'supabase_url'     => 'https://<your-project-ref>.supabase.co',

    // The service_role secret (from Settings → API).
    // Keep this secret — it bypasses Row Level Security. Do not commit or share it.
    'service_role_key' => 'your-service-role-key-here',
];
