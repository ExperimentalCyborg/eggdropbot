const sqlite3 = require('sqlite3').verbose();

module.exports = class Database {
    constructor() {
        this.db = undefined;
    }

    // Initialize the database
    async start(filePath) {
        this.db = new sqlite3.Database(filePath);
        await this.check_structure();
    }

    // Create the tables if they don't exist yet
    async check_structure() {
        await run(this.db, "SELECT * FROM `submissions` LIMIT 1;").catch(async () => {
            await run(this.db, "CREATE TABLE `submissions` (`userId` TEXT NOT NULL, `userName` TEXT, `url` TEXT NOT NULL, `messageId` TEXT NOT NULL, `timestamp` INTEGER, PRIMARY KEY (`userId`));");
        });

        await run(this.db, "SELECT * FROM `settings` LIMIT 1;").catch(async () => {
            await run(this.db, "CREATE TABLE `settings` (`key` TEXT NOT NULL, `value` TEXT, PRIMARY KEY (`key`));");
        });
    }

    // Gracefully exit
    exit() {
        if (this.db) {
            this.db.close();
        }
    }

    async getSetting(key) {
        let result;
        let query = "SELECT `value` FROM `settings` WHERE `key` = ?";
        await get(this.db, query, [key]).then(async row => {
            if (!row) {
                result = undefined;
            } else {
                result = JSON.parse(row.value);
            }
        });
        return result;
    }

    async setSetting(key, value){
        let query = "INSERT OR REPLACE INTO settings(`key`, `value`) VALUES(?, ?);";
        await run(this.db, query, [key, JSON.stringify(value)]);
    }

    async addSubmission(userId, userName, url, messageId, timestamp){
        let query = "INSERT OR REPLACE INTO submissions(`userId`, `userName`, `url`, `messageId`, `timestamp`) VALUES(?, ?, ?, ?, ?);";
        await run(this.db, query, [userId, userName, url, messageId, timestamp]);
    }

    async removeByUser(userId){
        let query = "DELETE FROM submissions WHERE `userId`=?;";
        await run(this.db, query, [userId]);
    }

    async removeByMessage(messageId){
        let query = "DELETE FROM submissions WHERE `messageId`=?;";
        await run(this.db, query, [messageId]);
    }

    async getSubmissions(){
        let result = [];
        let query = "SELECT * FROM `submissions`;";
        await all(this.db, query).then(async rows => {
            if (rows) {
                rows.forEach(row => {
                    result.push(row);
                })
            }
        });
        return result;
    }

    async clearSubmissions(){
        let query = "DELETE FROM submissions;";
        await run(this.db, query);
    }
}

//Run a query without data output
function run(db, query, params = []) { // async compatible wrapper around the old style callback from sqlite
    return new Promise((resolve, reject) => {
        db.run(query, params, error => {
            if (!error) {
                resolve(this);
            } else {
                reject(error);
            }
        });
    });
}

//Run a query and get the top row
function get(db, query, params = []) { // async compatible wrapper around the old style callback from sqlite
    return new Promise((resolve, reject) => {
        db.get(query, params, (error, row) => {
            if (!error) {
                resolve(row);
            } else {
                reject(error);
            }
        });
    });
}

//Run a query and get all rows
function all(db, query, params = []) { // async compatible wrapper around the old style callback from sqlite
    return new Promise((resolve, reject) => {
        db.all(query, params, (error, rows) => {
            if (!error) {
                resolve(rows);
            } else {
                reject(error);
            }
        });
    });
}
