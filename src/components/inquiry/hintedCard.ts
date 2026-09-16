import { createContext } from "react";

/**
 * The card the learner is working on (the newest one), which alone shows its hint so older cards stay quiet.
 * Null while the tutorial's coach panel is already saying the same thing at the bottom of the screen.
 */
export const HintedCardContext = createContext<string | null>(null);
