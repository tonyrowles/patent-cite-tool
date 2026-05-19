**CRITICAL: Answer verification after every AskUserQuestion call.**
After each AskUserQuestion call, verify the tool result contains the user's actual selection (the option label or free-text response). The result should name what the user picked.
- If the result is empty, generic (e.g., just "User has answered your questions: ."), or doesn't contain explicit choices — the tool FAILED to collect input.
- Do NOT assume, guess, or fabricate an answer. Do NOT pick the "(Recommended)" option on their behalf.
- Instead, present the same options as a numbered plain-text list and ask the user to type their choice number or describe their preference.
- Example fallback: "I couldn't capture your selection. Which do you prefer?\n1. Cards\n2. List\n3. Timeline\nType a number or describe what you'd like."
- Only proceed once you have a confirmed, explicit user response.
