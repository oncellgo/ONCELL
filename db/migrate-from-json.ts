// ---------------------------------------------------------------
// One-shot migration script: reads local data/*.json files and
// imports them into the Postgres database.
//
// Run with:
//   npx tsx db/migrate-from-json.ts
//
// Prereqs:
//   1. Schema applied (psql < db/schema.sql)
//   2. POSTGRES_URL set in .env.local
//   3. `npm install @neondatabase/serverless tsx dotenv`
// ---------------------------------------------------------------

import { readFile } from 'fs/promises';
import path from 'path';
import { sql } from '../lib/db';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const dataDir = path.join(process.cwd(), 'data');

const readJson = async <T = any>(file: string, fallback: T): Promise<T> => {
  try {
    const raw = await readFile(path.join(dataDir, file), 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const toDate = (v: any): Date | null => (v && typeof v === 'string' ? new Date(v) : null);

async function migrate() {
  console.log('▶ Starting migration...');

  // 1. communities
  const communities = await readJson<any[]>('communities.json', []);
  for (const c of communities) {
    await sql`
      INSERT INTO communities (id, name, admin_profile_id, join_approval_mode, require_real_name, timezone)
      VALUES (${c.id}, ${c.name}, ${c.adminProfileId || null}, ${c.joinApprovalMode || 'auto'}, ${c.requireRealName !== false}, ${c.timezone || 'Asia/Seoul'})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        admin_profile_id = EXCLUDED.admin_profile_id,
        join_approval_mode = EXCLUDED.join_approval_mode,
        require_real_name = EXCLUDED.require_real_name,
        timezone = EXCLUDED.timezone
    `;
  }
  console.log(`  ✓ communities: ${communities.length}`);

  // 2. system admins
  const sysAdmins = await readJson<{ profileIds?: string[] }>('system-admins.json', {});
  for (const pid of sysAdmins.profileIds || []) {
    await sql`INSERT INTO system_admins (profile_id) VALUES (${pid}) ON CONFLICT DO NOTHING`;
  }
  console.log(`  ✓ system_admins: ${sysAdmins.profileIds?.length || 0}`);

  // 3. users
  const users = await readJson<any[]>('users.json', []);
  for (const u of users) {
    await sql`
      INSERT INTO users (user_id, provider, provider_profile_id, community_id, community_name, nickname, real_name, contact, profile, membership_status, registered_at)
      VALUES (${u.userId}, ${u.provider}, ${u.providerProfileId}, ${u.communityId}, ${u.communityName || null}, ${u.nickname || null}, ${u.realName || null}, ${u.contact || null}, ${u.profile || null}, ${u.membershipStatus || 'active'}, ${toDate(u.registeredAt) || new Date()})
      ON CONFLICT (user_id) DO NOTHING
    `;
  }
  console.log(`  ✓ users: ${users.length}`);

  // 4. events
  const events = await readJson<any[]>('events.json', []);
  for (const e of events) {
    await sql`
      INSERT INTO events (id, community_id, title, created_by, created_by_name, scope, shared, start_at, end_at, location, description, recurrence_id, created_at)
      VALUES (${e.id}, ${e.communityId}, ${e.title}, ${e.createdBy || null}, ${e.createdByName || null}, ${e.scope || 'personal'}, ${!!e.shared}, ${toDate(e.startAt)}, ${toDate(e.endAt)}, ${e.location || null}, ${e.description || null}, ${e.recurrenceId || null}, ${toDate(e.createdAt) || new Date()})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  console.log(`  ✓ events: ${events.length}`);

  // 5. worship_services
  const services = await readJson<any[]>('worship-services.json', []);
  for (const s of services) {
    await sql`
      INSERT INTO worship_services (id, community_id, name, start_at, created_by, bulletin, bulletin_template_id, recurrence_id, is_default, published, published_at, edited_at, created_at)
      VALUES (${s.id}, ${s.communityId}, ${s.name}, ${toDate(s.startAt)}, ${s.createdBy || null}, ${s.bulletin || null}, ${s.bulletinTemplateId || null}, ${s.recurrenceId || null}, ${!!s.isDefault}, ${!!s.published}, ${toDate(s.publishedAt)}, ${toDate(s.editedAt)}, ${toDate(s.createdAt) || new Date()})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  console.log(`  ✓ worship_services: ${services.length}`);

  // 6. community_bulletin_templates
  const comTpl = await readJson<Record<string, any>>('community-bulletin-templates.json', {});
  const tplEntries = Object.entries(comTpl);
  for (const [cid, tpl] of tplEntries) {
    await sql`
      INSERT INTO community_bulletin_templates (community_id, template)
      VALUES (${cid}, ${tpl})
      ON CONFLICT (community_id) DO UPDATE SET template = EXCLUDED.template, updated_at = now()
    `;
  }
  console.log(`  ✓ community_bulletin_templates: ${tplEntries.length}`);

  // 7. worship_templates (system)
  const sysTpl = await readJson<any>('worship-templates.json', null);
  if (sysTpl) {
    await sql`
      INSERT INTO worship_templates (id, template)
      VALUES ('system', ${sysTpl})
      ON CONFLICT (id) DO UPDATE SET template = EXCLUDED.template, updated_at = now()
    `;
    console.log(`  ✓ worship_templates: system template imported`);
  }

  console.log('✅ Migration complete.');
}

migrate().catch((err) => {
  console.error('✗ Migration failed:', err);
  process.exit(1);
});
