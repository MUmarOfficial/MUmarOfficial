const fs = require('node:fs');
const path = require('node:path');

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

function generateSVGs(stats) {
  // Radical Theme Colors
  const COLORS = {
    bg: "#1a1b27",
    title: "#fe428e", // Pink
    text: "#a9fef7", // Cyan
    stats: "#f8d847", // Yellow
    border: "#30363d",
  };

  const style = `
    <style>
      .bg { fill: ${COLORS.bg}; stroke: ${COLORS.border}; stroke-width: 1px; }
      .title { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${COLORS.title}; }
      .label { font: 400 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${COLORS.title}; }
      .value { font: 600 24px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${COLORS.stats}; }
      .subtext { font: 400 12px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${COLORS.text}; }
      .divider { stroke: ${COLORS.text}; stroke-opacity: 0.3; stroke-width: 2; }
      .ring { fill: none; stroke: ${COLORS.title}; stroke-width: 4; stroke-linecap: round; }
      .fire { fill: ${COLORS.title}; }
      .progress-bg { fill: ${COLORS.border}; }
    </style>
  `;

  // 1. Stats Card (3-Column Layout like the image)
  const statsSvg = `
    <svg width="495" height="195" viewBox="0 0 495 195" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="494" height="194" rx="10" class="bg"/>
      ${style}
      
      <g transform="translate(0, 0)">
        <text x="82" y="80" text-anchor="middle" class="value">${stats.totalCommits}</text>
        <text x="82" y="110" text-anchor="middle" class="label">Total Contributions</text>
        <text x="82" y="140" text-anchor="middle" class="subtext">Commits & PRs</text>
      </g>

      <line x1="165" y1="40" x2="165" y2="155" class="divider" />

      <g transform="translate(165, 0)">
        <circle cx="82" cy="75" r="35" class="ring" stroke-dasharray="220" />
        <path d="M82 35 c-2 0-4 2-4 4 0 3 2 5 4 10 2-5 4-7 4-10 0-2-2-4-4-4z" class="fire" transform="translate(0, -5)"/>
        <text x="82" y="85" text-anchor="middle" class="value" style="font-size: 28px;">${stats.currentStreak}</text>
        <text x="82" y="125" text-anchor="middle" class="label" style="fill: ${COLORS.stats};">Current Streak</text>
        <text x="82" y="150" text-anchor="middle" class="subtext">Day Count</text>
      </g>

      <line x1="330" y1="40" x2="330" y2="155" class="divider" />

      <g transform="translate(330, 0)">
        <text x="82" y="80" text-anchor="middle" class="value">${stats.totalStars}</text>
        <text x="82" y="110" text-anchor="middle" class="label">Total Stars</text>
        <text x="82" y="140" text-anchor="middle" class="subtext">Across Repos</text>
      </g>
    </svg>
  `;

  // 2. Languages Card (Sleek Progress Bars)
  let langItems = stats.languages
    .map((l, i) => {
      const y = 60 + i * 35;
      return `
      <g transform="translate(25, ${y})">
        <text x="0" y="12" class="subtext" style="font-weight: 600;">${
          l.name
        }</text>
        <rect x="90" y="2" width="250" height="10" rx="5" class="progress-bg" />
        <rect x="90" y="2" width="${
          l.percent * 2.5
        }" height="10" rx="5" fill="${l.color}" />
        <text x="350" y="12" class="subtext">${l.percent.toFixed(1)}%</text>
      </g>
    `;
    })
    .join("");

  const langSvg = `
    <svg width="450" height="260" viewBox="0 0 450 260" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="449" height="259" rx="10" class="bg"/>
      ${style}
      <text x="25" y="40" class="title">Top Languages</text>
      ${langItems}
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