require('dotenv').config({ path: '.env.local' });
const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

async function syncMarkdownToNotion(filePath) {
  if (!process.env.NOTION_API_KEY || !DATABASE_ID) {
    console.error("❌ Missing NOTION_API_KEY or NOTION_DATABASE_ID in .env.local");
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath, '.md');

    console.log(`Syncing ${fileName} to Notion...`);

    // Create a new page in the Notion database
    const response = await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties: {
        // This assumes your Notion database has a default "Name" title property
        Name: {
          title: [{ text: { content: fileName } }]
        }
      },
      // Note: Notion limits text blocks to 2000 characters.
      // For this proof-of-concept, we dump the raw markdown into a Markdown code block.
      // To map Markdown elements to native Notion blocks (H1, checklists, etc.),
      // you would use a parsing library like 'markdown-to-notion-blocks' in the future.
      children: [
        {
          object: 'block',
          type: 'code',
          code: {
            rich_text: [{ text: { content: content.substring(0, 2000) } }],
            language: 'markdown'
          }
        }
      ]
    });

    console.log(`✅ Successfully synced! Page URL: ${response.url}`);
  } catch (error) {
    console.error('❌ Error syncing to Notion:', error.message);
  }
}

const targetFile = path.join(__dirname, '../PLANNING.md');
if (fs.existsSync(targetFile)) syncMarkdownToNotion(targetFile);
else console.log("⚠️ No PLANNING.md found to sync.");
