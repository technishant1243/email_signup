// MySQL version. Local par bhi chalta hai aur online (Render) par bhi.
const http = require("http");
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

// Online: DATABASE_URL = mysql://user:password@host:port/dbname
// Local : DB_HOST, DB_USER, DB_PASSWORD, DB_NAME (defaults neeche)
function getConfig() {
  if (process.env.DATABASE_URL) {
    const u = new URL(process.env.DATABASE_URL);
    return {
      host: u.hostname,
      port: Number(u.port) || 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace("/", ""),
      ssl: { rejectUnauthorized: false },
    };
  }
  return {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "email_signup",
  };
}

let pool;
async function initDb() {
  const cfg = getConfig();
  if (!process.env.DATABASE_URL) {
    // local: database nahi hai to bana do
    const tmp = await mysql.createConnection({ ...cfg, database: undefined });
    await tmp.query("CREATE DATABASE IF NOT EXISTS `" + cfg.database + "`");
    await tmp.end();
  }
  pool = mysql.createPool({ ...cfg, connectionLimit: 5 });
  await pool.query(`CREATE TABLE IF NOT EXISTS subscribers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log("MySQL connected");
}

const PUBLIC = path.join(__dirname, "public");
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript" };

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/submit") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let email = "";
      try { email = String(JSON.parse(body).email || "").trim().toLowerCase(); } catch {}
      res.setHeader("Content-Type", "application/json");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "Enter a valid email address." }));
      }
      try {
        await pool.query("INSERT IGNORE INTO subscribers (email) VALUES (?)", [email]);
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        console.error(e.message);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Could not save. Please try again." }));
      }
    });
    return;
  }

  let file = req.url.split("?")[0];
  if (file === "/") file = "/index.html";
  const full = path.join(PUBLIC, path.normalize(file));
  if (!full.startsWith(PUBLIC)) { res.statusCode = 403; return res.end(); }
  fs.readFile(full, (err, data) => {
    if (err) { res.statusCode = 404; return res.end("Not found"); }
    res.setHeader("Content-Type", types[path.extname(full)] || "application/octet-stream");
    res.end(data);
  });
});

initDb()
  .then(() => server.listen(process.env.PORT || 3000, () => console.log("Running at http://localhost:" + (process.env.PORT || 3000))))
  .catch((e) => {
    const first = (e.errors && e.errors[0]) || e;
    const code = e.code || first.code || "UNKNOWN";
    console.error("MySQL connection failed.");
    console.error("Error code:", code);
    console.error("Message   :", e.message || first.message || "(empty)");
    if (code === "ECONNREFUSED") console.error("Matlab: MySQL server band hai ya port galat hai. Services mein MySQL80 ko Start karo.");
    if (code === "ER_ACCESS_DENIED_ERROR") console.error("Matlab: user ya password galat hai. DB_PASSWORD (aur zaroorat ho to DB_USER) set karo.");
    if (code === "ER_BAD_DB_ERROR") console.error("Matlab: database nahi mila. DB_NAME check karo.");
    process.exit(1);
  });