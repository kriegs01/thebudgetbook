import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables (.env or .env.local)
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
// Prefer the service role key for administrative DB updates, fallback to anon key
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function parseLatestChangelog() {
  const changelogPath = path.resolve(process.cwd(), 'CHANGELOG.md');
  if (!fs.existsSync(changelogPath)) {
    console.error('❌ CHANGELOG.md not found in project root.');
    process.exit(1);
  }

  const content = fs.readFileSync(changelogPath, 'utf8');

  // Match version header: ## [v1.4.1] - 2026-10-14
  const versionRegex = /^##\s*\[([^\]]+)\]\s*-\s*([^\r\n]+)/m;
  const match = content.match(versionRegex);

  if (!match) {
    console.error('❌ Could not parse any version header like "## [vX.X.X] - YYYY-MM-DD" in CHANGELOG.md');
    process.exit(1);
  }

  const version = match[1].trim();
  const releaseDate = match[2].trim();

  // Extract the section block for this latest version up to the next "## " header
  const startIndex = match.index + match[0].length;
  const nextSectionIndex = content.slice(startIndex).search(/^##\s+/m);
  const sectionContent = nextSectionIndex === -1 
    ? content.slice(startIndex) 
    : content.slice(startIndex, startIndex + nextSectionIndex);

  const highlights = [];
  const fixes = [];
  let currentGroup = null;

  for (const line of sectionContent.split('\n')) {
    const trimmed = line.trim();
    if (/^###\s*What'?s New/i.test(trimmed)) {
      currentGroup = 'highlights';
      continue;
    } else if (/^###\s*Bug Fixes/i.test(trimmed)) {
      currentGroup = 'fixes';
      continue;
    } else if (/^###\s*/.test(trimmed)) {
      currentGroup = null;
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const item = trimmed.substring(2).trim();
      if (currentGroup === 'highlights') highlights.push(item);
      else if (currentGroup === 'fixes') fixes.push(item);
    }
  }

  return { version, releaseDate, highlights, fixes };
}

async function run() {
  const latest = parseLatestChangelog();
  console.log(`\n📦 Found release in CHANGELOG.md: ${latest.version} (${latest.releaseDate})`);
  console.log(`✨ Highlights: ${latest.highlights.length} | 🐛 Fixes: ${latest.fixes.length}`);

  console.log('\n🚀 Syncing to Supabase database...');

  // 1. Mark existing releases as not latest
  const { error: resetError } = await supabase
    .from('changelogs')
    .update({ is_latest: false })
    .neq('version', latest.version);

  if (resetError) {
    console.warn('⚠️ Warning resetting is_latest flags:', resetError.message);
  }

  // 2. Upsert the latest release entry
  const { error: upsertError } = await supabase
    .from('changelogs')
    .upsert({
      version: latest.version,
      release_date: latest.releaseDate,
      is_latest: true,
      highlights: latest.highlights,
      fixes: latest.fixes
    }, { onConflict: 'version' });

  if (upsertError) {
    console.error('❌ Failed to update Supabase:', upsertError.message);
    process.exit(1);
  }

  console.log(`✅ Database updated! Version ${latest.version} is now marked as latest.`);

  // 3. Git commit & tag workflow
  try {
    console.log('\n🐙 Staging CHANGELOG.md and committing...');
    execSync('git add CHANGELOG.md', { stdio: 'inherit' });
    
    // Check if there are staged changes
    const status = execSync('git status --porcelain').toString();
    if (status.includes('CHANGELOG.md')) {
      execSync(`git commit -m "docs(changelog): release ${latest.version}"`, { stdio: 'inherit' });
      console.log(`✅ Git commit created for ${latest.version}`);
    } else {
      console.log('ℹ️ CHANGELOG.md already committed.');
    }

    // Optional: create local tag if not existing
    try {
      execSync(`git tag -a ${latest.version} -m "Release ${latest.version}"`, { stdio: 'ignore' });
      console.log(`🏷️  Tagged git release: ${latest.version}`);
    } catch {
      // Tag already exists, skip
    }

    console.log('\n🎉 All set! Run "git push && git push --tags" to publish to remote.');
  } catch (gitErr) {
    console.warn('⚠️ Git step skipped or had a minor issue:', gitErr.message);
  }
}

run();
