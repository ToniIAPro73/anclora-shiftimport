import { neon, Client as NeonClient } from '@neondatabase/serverless';
import pg from 'pg';

const { Pool, Client: PgClient } = pg;

export function isLocalConnection(connectionString) {
  try {
    const hostname = new URL(connectionString).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

export function createTaggedSql(connectionString) {
  if (!isLocalConnection(connectionString)) {
    return neon(connectionString);
  }

  const pool = new Pool({ connectionString, ssl: false });
  const makeQuery = (text, values, runner = (queryText, params) => pool.query(queryText, params)) => {
    let started = false;
    let resultPromise;
    const start = () => {
      if (!started) {
        started = true;
        resultPromise = Promise.resolve(runner(text, values)).then((result) => result.rows ?? result);
      }
      return resultPromise;
    };
    return {
      queryText: text,
      values,
      then: (onFulfilled, onRejected) => start().then(onFulfilled, onRejected),
      catch: (onRejected) => start().catch(onRejected),
      finally: (onFinally) => start().finally(onFinally),
    };
  };
  const sql = (strings, ...values) => {
    let text = strings[0];
    for (let index = 0; index < values.length; index += 1) {
      text += `$${index + 1}${strings[index + 1]}`;
    }
    return makeQuery(text, values);
  };
  sql.transaction = async (batch) => {
    const client = await pool.connect();
    try {
      const txn = (strings, ...values) => {
        let text = strings[0];
        for (let index = 0; index < values.length; index += 1) {
          text += `$${index + 1}${strings[index + 1]}`;
        }
        return makeQuery(text, values, (queryText, params) => client.query(queryText, params));
      };
      const queries = typeof batch === 'function' ? batch(txn) : batch;
      await client.query('BEGIN');
      const results = [];
      for (const query of queries) {
        if (query?.queryText) {
          results.push(await query);
        } else {
          results.push(await query);
        }
      }
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
  sql.end = () => pool.end();
  return sql;
}

export function createClient(connectionString) {
  return isLocalConnection(connectionString)
    ? new PgClient({ connectionString, ssl: false })
    : new NeonClient(connectionString);
}
