import { Level } from 'level';
import { join } from 'path';
import { logger } from '../utils/logger';

export interface Transaction {
  transactionHash: string;
  tokenAddress: string;
  pairAddress: string;
  buyCostVirtualAmount: string;
  buyTime: string;
  purchasedToken: string;
  sellTime?: string;
  soldVirtualAmount?: string;
  profit?: string;
  status: 'BOUGHT' | 'SOLD' | 'FAILED';
}

class TransactionDB {
  private db: Level<string, Transaction>;

  constructor() {
    this.db = new Level<string, Transaction>(join(__dirname, '../../data'), {
      valueEncoding: 'json'
    });
  }

  async init() {
    try {
      await this.db.open();
      logger.info('LevelDB 数据库已成功打开');
    } catch (error) {
      logger.error('打开 LevelDB 数据库时出错:', error);
      throw error;
    }
  }

  async saveTransaction(transaction: Transaction): Promise<void> {
    try {
      await this.db.put(transaction.transactionHash, transaction);
    } catch (error) {
      logger.error('保存交易记录时出错:', error);
      throw error;
    }
  }

  async getTransaction(hash: string): Promise<Transaction | null> {
    try {
      const transaction = await this.db.get(hash);
      return transaction;
    } catch (error: any) {
      if (error.notFound) {
        return null;
      }
      logger.error('获取交易记录时出错:', error);
      throw error;
    }
  }

  async updateTransaction(hash: string, updates: Partial<Transaction>): Promise<void> {
    try {
      const transaction = await this.getTransaction(hash);
      if (!transaction) {
        throw new Error(`交易记录不存在: ${hash}`);
      }

      const updatedTransaction = { ...transaction, ...updates };
      await this.saveTransaction(updatedTransaction);
    } catch (error) {
      logger.error('更新交易记录时出错:', error);
      throw error;
    }
  }

  async getAllBoughtTransactions(): Promise<Transaction[]> {
    const transactions: Transaction[] = [];
    
    try {
      for await (const [_, value] of this.db.iterator()) {
        if (value.status === 'BOUGHT') {
          transactions.push(value);
        }
      }
    } catch (error) {
      logger.error('获取已买入交易记录时出错:', error);
      throw error;
    }

    return transactions;
  }

  async close(): Promise<void> {
    try {
      await this.db.close();
      logger.info('LevelDB 数据库已关闭');
    } catch (error) {
      logger.error('关闭 LevelDB 数据库时出错:', error);
      throw error;
    }
  }
}

// 导出单例实例
export const transactionDB = new TransactionDB();
