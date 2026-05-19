import fs from "fs";
import axios from "axios";
import { SocksProxyAgent } from "socks-proxy-agent";

const proxy = "socks5://127.0.0.1:10808";

const agent = new SocksProxyAgent(proxy);

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
};

async function fetchEvents() {
  const res = await axios.get(
    "https://api.sportlive.cc/data/events.json",
    {
      httpsAgent: agent,
      httpAgent: agent,
      headers,
      timeout: 20000
    }
  );

  return res.data;
}

async function fetchStream(id) {
  try {
    const params = new URLSearchParams();
    params.append("id", id);

    const res = await axios.post(
      "https://data.stnye.cc/data/stream.php",
      params,
      {
        httpsAgent: agent,
        httpAgent: agent,
        headers: {
          ...headers,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        timeout: 15000
      }
    );

    if (res.data?.status === "success") {
      return res.data.content;
    }
  } catch (e) {
    console.log("解析失败:", id);
  }

  return null;
}

async function main() {
  console.log("开始获取赛事...");

  const data = await fetchEvents();

  const streams = [];

  for (const event of data.events || []) {
    for (const ch of event.channels || []) {
      if (ch.islive === 1) {
        streams.push({
          title: event.title || "未知赛事",
          competition: event.competition || "体育",
          lang: ch.islg || "原音",
          hd: ch.ishd || "HD",
          id: ch.id
        });
      }
    }
  }

  console.log(`找到 ${streams.length} 个直播源`);

  const results = [];

  const concurrency = 10;

  for (let i = 0; i < streams.length; i += concurrency) {
    const batch = streams.slice(i, i + concurrency);

    const res = await Promise.all(
      batch.map(async (s) => {
        const url = await fetchStream(s.id);

        if (!url) return null;

        return {
          ...s,
          url
        };
      })
    );

    results.push(...res.filter(Boolean));
  }

  console.log(`成功解析 ${results.length} 个`);

  let m3u = "#EXTM3U\n";
  let txt = "职球圈,#genre#\n";

  for (const r of results) {
    const name =
      `${r.competition}_${r.title}_${r.lang}_${r.hd}`
        .replace(/\s+/g, "_");

    m3u += `#EXTINF:-1 group-title="职球圈",${name}\n`;
    m3u += `${r.url}\n`;

    txt += `${name},${r.url}\n`;
  }

  fs.writeFileSync("live.m3u", m3u);
  fs.writeFileSync("live.txt", txt);

  console.log("文件生成完成");
}

main().catch(console.error);
