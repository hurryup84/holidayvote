<?php
// index.php — HolidayVote statistics via Supabase REST API (HTTPS)
// Works from Synology NAS without pdo_pgsql or direct database port access.

declare(strict_types=1);

$configFile = __DIR__ . '/config.php';

if (!file_exists($configFile)) {
    http_response_code(500);
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>HolidayVote stats — setup required</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 600px; margin: 3rem auto; padding: 0 1rem; line-height: 1.6; }
  h1 { color: #c00; }
  code { background: #f4f4f4; padding: 0 0.2rem; border-radius: 3px; }
  pre { background: #f8f8f8; border: 1px solid #ddd; padding: 1rem; overflow: auto; border-radius: 5px; }
</style>
</head>
<body>
<h1>Setup required</h1>
<p>Copy <code>stats/config.example.php</code> to <code>stats/config.php</code> and fill in your Supabase URL and service_role key.</p>
</body>
</html>
<?php
    exit;
}

$config = require $configFile;

$supabaseUrl = rtrim($config['supabase_url'] ?? '', '/');
$serviceRoleKey = $config['service_role_key'] ?? '';

function apiGet(string $url, string $key): array|false {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTPHEADER     => [
            "apikey: $key",
            "Authorization: Bearer $key",
        ],
    ]);
    $result = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($result === false || $httpCode >= 400) {
        return false;
    }
    return json_decode($result, true);
}

$error = null;
$totalVacations = 0;
$rows = [];

if (!function_exists('curl_init')) {
    $error = 'PHP cURL extension is not installed on this NAS. Enable it in Web Station → PHP Settings, or use Docker.';
} elseif ($supabaseUrl && $serviceRoleKey) {
    // Fetch vacations (with owner_id for owner lookup)
    $vacations = apiGet(
        "$supabaseUrl/rest/v1/vacations?select=id,name,destination,created_at,owner_id&deleted_at=is.null&order=created_at.desc",
        $serviceRoleKey
    );

    if ($vacations === false) {
        $error = 'Could not fetch vacations from Supabase API.';
    } else {
        $totalVacations = count($vacations);

        // Fetch all profiles for owner name lookup
        $profiles = apiGet(
            "$supabaseUrl/rest/v1/profiles?select=id,display_name",
            $serviceRoleKey
        );
        $profileMap = [];
        if ($profiles) {
            foreach ($profiles as $p) {
                $profileMap[$p['id'] ?? ''] = $p['display_name'] ?? '(unknown)';
            }
        }

        // Fetch members per vacation (vacation_members has a display_name copy)
        $members = apiGet(
            "$supabaseUrl/rest/v1/vacation_members?select=vacation_id,user_id,display_name",
            $serviceRoleKey
        );
        $memberMap = [];
        if ($members) {
            foreach ($members as $m) {
                $vid = $m['vacation_id'] ?? null;
                if ($vid) {
                    $memberMap[$vid][] = $m['display_name'] ?? '(unknown)';
                }
            }
        }

        // Fetch houses per vacation
        $houses = apiGet(
            "$supabaseUrl/rest/v1/properties?select=vacation_id&deleted_at=is.null",
            $serviceRoleKey
        );
        $houseCounts = [];
        if ($houses) {
            foreach ($houses as $h) {
                $vid = $h['vacation_id'] ?? null;
                if ($vid) {
                    $houseCounts[$vid] = ($houseCounts[$vid] ?? 0) + 1;
                }
            }
        }

        // Combine everything per vacation
        foreach ($vacations as $v) {
            $vid = $v['id'] ?? null;
            $ownerId = $v['owner_id'] ?? null;
            $memberNames = $memberMap[$vid] ?? [];

            $rows[] = [
                'name'       => $v['name'] ?? '',
                'destination'=> $v['destination'] ?? '',
                'created'    => $v['created_at'] ? substr($v['created_at'], 0, 10) : '',
                'owner'      => $profileMap[$ownerId] ?? '(unknown)',
                'members'    => $memberNames,
                'member_count'=> count($memberNames),
                'houses'     => $houseCounts[$vid] ?? 0,
            ];
        }
    }
} else {
    $error = 'Missing Supabase URL or service_role key in config.php.';
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HolidayVote statistics</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1100px; margin: 2rem auto; padding: 0 1rem; color: #111; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  .subtitle { color: #666; margin-bottom: 1.5rem; }
  .total { font-size: 1.75rem; margin-bottom: 1.5rem; }
  .total strong { color: #2563eb; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; background: #fff; }
  th, td { border: 1px solid #e5e7eb; padding: 0.75rem; text-align: left; font-size: 0.95rem; vertical-align: top; }
  th { background: #f9fafb; font-weight: 600; color: #374151; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.05em; }
  tr:nth-child(even) { background: #fcfcfd; }
  td.numeric { text-align: right; font-variant-numeric: tabular-nums; }
  .members { font-size: 0.85rem; color: #4b5563; line-height: 1.4; }
  .members span { white-space: pre-wrap; }
  .err { color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; padding: 1rem; border-radius: 6px; margin-bottom: 1rem; }
  .muted { color: #6b7280; font-size: 0.85rem; margin-top: 1.5rem; }
</style>
</head>
<body>
<h1>HolidayVote statistics</h1>
<p class="subtitle">Vacations, houses, and members — queried via Supabase REST API.</p>

<?php if ($error): ?>
  <div class="err"><?php echo htmlspecialchars($error, ENT_QUOTES, 'UTF-8'); ?></div>
<?php else: ?>
  <div class="total">Total vacations: <strong><?php echo $totalVacations; ?></strong></div>

  <table>
    <thead>
      <tr>
        <th>Vacation</th>
        <th>Destination</th>
        <th>Created</th>
        <th>Owner</th>
        <th>Members</th>
        <th class="numeric">Houses</th>
      </tr>
    </thead>
    <tbody>
    <?php if (empty($rows)): ?>
      <tr><td colspan="6" style="text-align:center; color:#666;">No vacations found.</td></tr>
    <?php endif; ?>
    <?php foreach ($rows as $row): ?>
      <tr>
        <td><?php echo htmlspecialchars($row['name'] ?? '', ENT_QUOTES, 'UTF-8'); ?></td>
        <td><?php echo htmlspecialchars($row['destination'] ?? '', ENT_QUOTES, 'UTF-8'); ?></td>
        <td><?php echo htmlspecialchars($row['created'] ?? '', ENT_QUOTES, 'UTF-8'); ?></td>
        <td><?php echo htmlspecialchars($row['owner'] ?? '(unknown)', ENT_QUOTES, 'UTF-8'); ?></td>
        <td class="members">
          <?php if (empty($row['members'])): ?>
            <span style="color:#9ca3af;">—</span>
          <?php else: ?>
            <?php $first = true; foreach ($row['members'] as $mname): ?>
              <?php if (!$first): ?>, <?php endif; ?>
              <?php echo htmlspecialchars($mname, ENT_QUOTES, 'UTF-8'); ?>
              <?php $first = false; ?>
            <?php endforeach; ?>
            <span style="font-size:0.75rem; color:#6b7280;"> (<?php echo (int) $row['member_count']; ?>)</span>
          <?php endif; ?>
        </td>
        <td class="numeric"><?php echo (int) ($row['houses'] ?? 0); ?></td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table>
<?php endif; ?>

<p class="muted">
  Data queried via Supabase REST API (service_role key).<br>
  Owner = vacation creator. Members = all joined participants.<br>
  For local network use only — do not expose to the internet.
</p>
</body>
</html>
