const fs = require('fs');
const path = require('path');

// --- 1. CONFIGURATION ---
const TOKEN = process.env.STATS_TOKEN;
const USERNAME = process.env.GITHUB_REPOSITORY ? process.env.GITHUB_REPOSITORY.split('/')[0] : "MUmarOfficial";
const OUTPUT_DIR = path.join(__dirname, '..', 'generated');

// Ensure the output folder exists
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

// --- 2. GRAPHQL QUERY (Getting the data) ---
const query = `
  query($login: String!) {
    user(login: $login) {
      createdAt
      contributionsCollection {
        totalCommitContributions
        restrictedContributionsCount
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
            }
          }
        }
      }
      repositories(first: 100, ownerAffiliations: [OWNER], orderBy: {direction: DESC, field: STARGAZERS}) {
        nodes {
          name
          stargazers { totalCount }
          languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
            edges {
              size
              node {
                name
                color
              }
            }
          }
        }
      }
    }
  }
`;

// --- 3. FETCH DATA ---
async function fetchData() {
  // Native Node.js fetch (available in Node 18+)
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { login: USERNAME } }),
  });
  
  const json = await res.json();
  if (json.errors) {
    console.error("API Errors:", JSON.stringify(json.errors, null, 2));
    throw new Error("Failed to fetch data from GitHub API");
  }
  return json.data.user;
}

// --- 4. CALCULATE STATS ---
function calculateStats(data) {
  const calendar = data.contributionsCollection.contributionCalendar;
  
  // Calculate Streak
  let currentStreak = 0;
  const days = calendar.weeks.flatMap(w => w.contributionDays).sort((a, b) => new Date(b.date) - new Date(a.date));
  const today = new Date().toISOString().split('T')[0];
  
  for (const day of days) {
    if (day.date > today) continue; // Skip future days
    if (day.contributionCount > 0) {
      currentStreak++;
    } else if (day.date < today) {
      // If we miss a day before today, streak ends
      break;
    }
  }

  // Calculate Languages
  const langMap = {};
  let totalSize = 0;
  
  data.repositories.nodes.forEach(repo => {
    repo.languages.edges.forEach(edge => {
      const { name, color } = edge.node;
      const size = edge.size;
      if (!langMap[name]) langMap[name] = { size: 0, color: color || '#ccc' };
      langMap[name].size += size;
      totalSize += size;
    });
  });

  const languages = Object.entries(langMap)
    .map(([name, val]) => ({ 
      name, 
      color: val.color, 
      percent: (val.size / totalSize) * 100 
    }))
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 5); // Keep top 5

  return {
    totalStars: data.repositories.nodes.reduce((acc, repo) => acc + repo.stargazers.totalCount, 0),
    totalCommits: data.contributionsCollection.totalCommitContributions + data.contributionsCollection.restrictedContributionsCount,
    totalContributions: calendar.totalContributions,
    currentStreak,
    languages
  };
}

// --- 5. GENERATE SVG IMAGES ---
function generateSVGs(stats) {
  // CSS Styles for the SVG
  const style = `
    <style>
      .bg { fill: #fff; stroke: #e1e4e8; }
      .text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; fill: #24292e; }
      .header { font-weight: 600; font-size: 18px; fill: #0969da; }
      .stat-label { font-size: 14px; fill: #586069; }
      .stat-value { font-size: 14px; font-weight: 600; fill: #24292e; }
      
      /* Dark Mode Support via Media Query */
      @media (prefers-color-scheme: dark) {
        .bg { fill: #0d1117; stroke: #30363d; }
        .text, .stat-value { fill: #c9d1d9; }
        .stat-label { fill: #8b949e; }
        .header { fill: #58a6ff; }
      }
    </style>
  `;

  // 1. Stats Card
  const statsSvg = `
    <svg width="400" height="150" viewBox="0 0 400 150" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="399" height="149" rx="4.5" class="bg" stroke-width="1"/>
      ${style}
      <text x="25" y="35" class="header">GitHub Stats</text>
      
      <g transform="translate(25, 60)">
        <text y="0" class="stat-label">Total Stars:</text>
        <text x="120" y="0" class="stat-value">${stats.totalStars}</text>
        
        <text y="25" class="stat-label">Total Commits:</text>
        <text x="120" y="25" class="stat-value">${stats.totalCommits}</text>
        
        <text y="50" class="stat-label">Contributions:</text>
        <text x="120" y="50" class="stat-value">${stats.totalContributions}</text>
      </g>
      
      <g transform="translate(220, 60)">
         <text y="0" class="stat-label">Current Streak:</text>
         <text x="110" y="0" class="stat-value">${stats.currentStreak} days</text>
      </g>
    </svg>
  `;

  // 2. Languages Card
  let langY = 40;
  const langRows = stats.languages.map(l => {
    const row = `
      <text x="25" y="${langY + 11}" class="text" font-size="12">${l.name}</text>
      <rect x="100" y="${langY+2}" width="${l.percent * 2}" height="10" rx="3" fill="${l.color}" />
      <text x="${100 + (l.percent * 2) + 10}" y="${langY + 11}" class="stat-label" font-size="12">${l.percent.toFixed(1)}%</text>
    `;
    langY += 25;
    return row;
  }).join('');

  const langSvg = `
    <svg width="400" height="${langY + 20}" viewBox="0 0 400 ${langY + 20}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="399" height="${langY + 19}" rx="4.5" class="bg" stroke-width="1"/>
      ${style}
      <text x="25" y="30" class="header">Top Languages</text>
      ${langRows}
    </svg>
  `;

  return { statsSvg, langSvg };
}

// --- 6. MAIN EXECUTION ---
(async () => {
  try {
    if (!TOKEN) throw new Error("STATS_TOKEN is missing in environment variables.");
    
    console.log(`Fetching stats for ${USERNAME}...`);
    const data = await fetchData();
    const stats = calculateStats(data);
    const { statsSvg, langSvg } = generateSVGs(stats);

    fs.writeFileSync(path.join(OUTPUT_DIR, 'stats.svg'), statsSvg);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'languages.svg'), langSvg);
    
    console.log("✅ Stats images generated in /generated folder!");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
})();