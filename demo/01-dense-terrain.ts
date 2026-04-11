// ============================================================
//  Code Cat Demo: Dense Terrain
//  — Lots of consecutive text lines for smooth running
// ============================================================

const database = {
    host: "localhost",
    port: 5432,
    name: "code_cat_db",
    user: "admin",
    password: "********",
    pool: { min: 2, max: 10 },
    ssl: false,
    timeout: 30000,
    retries: 3,
    logging: true,
};

function connectToDatabase(config: typeof database) {
    console.log("Connecting to", config.host);
    console.log("Port:", config.port);
    console.log("Database:", config.name);
    return { connected: true, timestamp: Date.now() };
}

function queryUsers() {
    return [
        { id: 1, name: "Alice", role: "admin" },
        { id: 2, name: "Bob", role: "user" },
        { id: 3, name: "Charlie", role: "user" },
        { id: 4, name: "Diana", role: "moderator" },
        { id: 5, name: "Eve", role: "user" },
    ];
}

function formatUser(user: { id: number; name: string; role: string }) {
    return `[${user.id}] ${user.name} (${user.role})`;
}

// The cat should run smoothly across this dense block of code!
// Watch it leave paw prints as it goes.
