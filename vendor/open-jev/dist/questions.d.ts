import type { ChoiceQuestion, NoulQuestion, Question, ScoreQuestion } from "./types";
/** Options the models were trained with for `noul` questions (index 1 = yes). */
export declare const NOUL_OPTIONS: readonly ["no", "yes"];
export type QuestionLimits = {
    minChoiceOptions: number;
    maxChoiceOptions: number;
    minScoreLevels: number;
    maxScoreLevels: number;
};
/** Build a `choice` question: pick one of the given options. */
export declare function choice<const O extends string>(instructions: string, options: readonly O[], descriptions?: Partial<Record<O, string>>): ChoiceQuestion<O>;
/** Build a `score` question: rate on an ordered scale (first = lowest). */
export declare function score<const L extends string>(instructions: string, levels: readonly L[]): ScoreQuestion<L>;
/** Build a `noul` question: does the statement hold for the state? */
export declare function noul(statement: string): NoulQuestion;
/** Option labels of a question (keys of the answer distribution). */
export declare function questionLabels(question: Question): readonly string[];
/** Option texts as they are fed to the model (`name: description` when given). */
export declare function questionOptionTexts(question: Question): string[];
export declare function validateQuestion(question: Question, label: string, limits: QuestionLimits): void;
//# sourceMappingURL=questions.d.ts.map