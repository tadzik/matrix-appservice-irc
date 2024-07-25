import {PoolClient} from "pg";

export async function runSchema(connection: PoolClient) {
    await connection.query(`
    CREATE TABLE member_join_times (
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        CONSTRAINT cons_member_join_times_unique UNIQUE(room_id, user_id)
    );`
    );
}
