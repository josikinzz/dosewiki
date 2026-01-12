const articles = require('./src/data/articles.json');
const fs = require('fs');

// Get published slugs
const publishedSlugs = new Set(articles.map(a => a.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')));

// Read SKILL.md and extract tracker items
const skillContent = fs.readFileSync('.claude/skills/harm-potential/SKILL.md', 'utf8');
const trackerMatches = skillContent.match(/- \[.\] ([a-z0-9-]+)/g) || [];
const trackerSlugs = trackerMatches.map(m => m.replace(/- \[.\] /, '').split(' ')[0]);

// Find substances in tracker but NOT in articles
const notPublished = trackerSlugs.filter(slug => !publishedSlugs.has(slug));
const published = trackerSlugs.filter(slug => publishedSlugs.has(slug));

console.log('=== SUBSTANCES IN TRACKER BUT NOT ON SITE ===');
console.log(notPublished.join('\n'));
console.log('\n=== STATS ===');
console.log('Total in tracker:', trackerSlugs.length);
console.log('Published on site:', published.length);
console.log('NOT published:', notPublished.length);
