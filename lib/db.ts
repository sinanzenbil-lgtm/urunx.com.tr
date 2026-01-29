import { neon } from '@neondatabase/serverless';

type SqlTag = (strings: TemplateStringsArray, ...values: any[]) => Promise<any>;

const databaseUrl = process.env.DATABASE_URL;
const isValidDatabaseUrl = (() => {
    if (!databaseUrl || databaseUrl === 'your_database_url_here') return false;
    try {
        new URL(databaseUrl);
        return true;
    } catch {
        return false;
    }
})();

const fallbackSql: SqlTag = async () => {
    throw new Error('DATABASE_URL is missing or invalid. Database features are disabled.');
};

export const sql: SqlTag = isValidDatabaseUrl ? neon(databaseUrl as string) : fallbackSql;
