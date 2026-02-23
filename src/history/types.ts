/**
 * Represents a single stored conversation turn in Redis.
 * Contains the minimal data required to reconstruct a full messages[] array.
 */
export interface StoredTurn {
  userInput: string;
  assistantOutput: string;
  previousResponseId: string | null;
}
