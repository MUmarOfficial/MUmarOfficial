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
  // Radical Theme Colors - Matches your screenshot exactly
  const COLORS = {
    bg: "#1a1b27",
    pink: "#fe428e",
    cyan: "#a9fef7",
    yellow: "#f8d847",
    border: "#30363d",
    barBg: "#282a36",
  };

  const style = `
    <style>
      .bg { fill: ${COLORS.bg}; stroke: ${COLORS.border}; stroke-width: 1.5px; }
      .title { font: 600 22px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${COLORS.pink}; }
      .label { font: 400 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${COLORS.pink}; }
      .value { font: 600 28px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${COLORS.pink}; }
      .streak-val { font: 600 28px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${COLORS.yellow}; }
      .subtext { font: 400 12px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${COLORS.cyan}; }
      .divider { stroke: ${COLORS.cyan}; stroke-opacity: 0.3; stroke-width: 2; }
      .ring { fill: none; stroke: ${COLORS.pink}; stroke-width: 4; stroke-linecap: round; }
      .fire { fill: ${COLORS.pink}; }
    </style>
  `;

  // --- Card 1: Activity Stats (3-Column Layout) ---
  const statsSvg = `
    <svg width="495" height="195" viewBox="0 0 495 195" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="493" height="193" rx="10" class="bg"/>
      ${style}
      
      <g transform="translate(0, 0)">
        <text x="82" y="80" text-anchor="middle" class="value">${stats.totalContributions}</text>
        <text x="82" y="115" text-anchor="middle" class="label">Total Contributions</text>
        <text x="82" y="145" text-anchor="middle" class="subtext">Jun 25, 2024 - Present</text>
      </g>

      <line x1="165" y1="40" x2="165" y2="155" class="divider" />

      <g transform="translate(165, 0)">
        <path d="M82 18 c-3 0-6 3-6 6 0 4.5 3 7.5 6 15 3-7.5 6-10.5 6-15 0-3-3-6-6-6z" class="fire" transform="translate(0, 5)"/>
        <circle cx="82" cy="75" r="38" class="ring" />
        <text x="82" y="85" text-anchor="middle" class="streak-val">${stats.currentStreak}</text>
        <text x="82" y="135" text-anchor="middle" class="streak-val" style="font-size: 16px;">Current Streak</text>
        <text x="82" y="160" text-anchor="middle" class="subtext">Jan 5 - Jan 9</text>
      </g>

      <line x1="330" y1="40" x2="330" y2="155" class="divider" />

      <g transform="translate(330, 0)">
        <text x="82" y="80" text-anchor="middle" class="value">${stats.totalStars}</text>
        <text x="82" y="115" text-anchor="middle" class="label">Total Stars</text>
        <text x="82" y="145" text-anchor="middle" class="subtext">Across All Repos</text>
      </g>
    </svg>
  `;

  // --- Card 2: Languages (Beautiful Progress Bars) ---
  let langItems = stats.languages
    .map((l, i) => {
      const y = 80 + i * 45;
      return `
      <g transform="translate(30, ${y})">
        <text x="0" y="12" class="subtext" style="font-weight: 600; font-size: 15px;">${
          l.name
        }</text>
        <rect x="110" y="2" width="240" height="12" rx="6" fill="${
          COLORS.barBg
        }" />
        <rect x="110" y="2" width="${
          l.percent * 2.4
        }" height="12" rx="6" fill="${l.color}" />
        <text x="365" y="12" class="subtext" style="font-size: 14px;">${l.percent.toFixed(
          1
        )}%</text>
      </g>
    `;
    })
    .join("");

  const langSvg = `
    <svg width="450" height="340" viewBox="0 0 450 340" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="448" height="338" rx="10" class="bg"/>
      ${style}
      <text x="30" y="50" class="title">Top Languages</text>
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