# Solution Format Guide for English Questions

This document explains how to add solutions to English questions in the SSC CGL Practice Platform.

## Format Structure

Each question should include a `solution` field in the following format:

```javascript
{
  question_number: 1,
  text: "Your question text here",
  options: {
    A: "Option A text",
    B: "Option B text",
    C: "Option C text",
    D: "Option D text"
  },
  correct_answer_index: 0, // 0 for A, 1 for B, 2 for C, 3 for D
  year: "2023",
  solution: "Sol.1.(a) Your detailed explanation here. Explain the rule, concept, or reasoning behind the correct answer."
}
```

## Solution Format Rules

1. **Start with "Sol."** followed by the question number
2. **Include the answer letter** in parentheses: (a), (b), (c), or (d)
3. **Provide detailed explanation** covering:
   - The grammatical rule or concept
   - Why the correct answer is right
   - Why other options are wrong (when relevant)
   - Examples or additional context (when helpful)

## Examples

### Example 1: Grammar Question (Subject-Verb Agreement)
```javascript
{
  question_number: 15,
  text: "The committee, which oversee multiple departments, (1)/ has been granted additional funds (2)/ to implement the new sustainability policies (3)/ across all regional offices. (4)",
  options: {
    A: "(1)",
    B: "(2)",
    C: "(3)",
    D: "(4)"
  },
  correct_answer_index: 0,
  year: "2025",
  solution: "Sol.15.(a) According to the 'Subject-Verb Agreement Rule', a singular subject always takes a singular verb and a plural subject always takes a plural verb. In the given sentence, the subject 'committee' is a collective noun and acts as a single unit. Hence, 'which oversees multiple departments' is the most appropriate answer."
}
```

### Example 2: Vocabulary Question (Synonym)
```javascript
{
  question_number: 3,
  text: "Select the most appropriate synonym of 'METICULOUS'",
  options: {
    A: "Careless",
    B: "Careful",
    C: "Hasty",
    D: "Negligent"
  },
  correct_answer_index: 1,
  year: "2023",
  solution: "Sol.3.(b) 'Meticulous' means showing great attention to detail; very careful and precise. 'Careful' is the closest synonym. Options A, C, and D represent opposite meanings - careless, hasty, and negligent all indicate lack of attention to detail."
}
```

### Example 3: Comprehension Question (Tense)
```javascript
{
  question_number: 2,
  text: "Select the most appropriate option to improve the underlined segment. 'He is working here since 2015.'",
  options: {
    A: "has been working",
    B: "was working",
    C: "had been working",
    D: "No improvement"
  },
  correct_answer_index: 0,
  year: "2022",
  solution: "Sol.2.(a) When we use 'since' with a specific point in time (2015), we need the Present Perfect Continuous tense to show an action that started in the past and continues to the present. 'Has been working' is the correct form. 'Is working' (simple present continuous) cannot be used with 'since'."
}
```

### Example 4: Idiom Question
```javascript
{
  question_number: 1,
  text: "Select the most appropriate meaning of the given idiom. 'A piece of cake'",
  options: {
    A: "Something very difficult",
    B: "Something very easy",
    C: "A delicious dessert",
    D: "A small portion"
  },
  correct_answer_index: 1,
  year: "2023",
  solution: "Sol.1.(b) The idiom 'A piece of cake' means something that is very easy to do or accomplish. It is used to describe a task that requires little effort. For example, 'The exam was a piece of cake.' Options A, C, and D do not represent the idiomatic meaning."
}
```

## Tips for Writing Good Solutions

1. **Be Clear and Concise**: Explain the concept clearly without unnecessary complexity
2. **Reference Rules**: Mention the specific grammar rule or concept being tested
3. **Provide Context**: Give examples or additional context when helpful
4. **Explain All Options**: When relevant, explain why incorrect options are wrong
5. **Use Proper Formatting**: Follow the solution number format consistently
6. **Keep it Educational**: The goal is to help students learn, not just show the answer

## Solution Display

When a question is answered, the solution will be displayed:
- ✅ For correct answers: Green background with checkmark
- ❌ For wrong answers: Red background with cross mark
- 📚 Solution section appears below with:
  - "Explanation" header with icon
  - Detailed solution text in a clean, readable format

## Adding Solutions to Existing Questions

To add solutions to existing questions without solutions:

1. Open the chapter file (e.g., `chapters/Grammar.js`)
2. Find the question object
3. Add the `solution` field before the closing brace
4. Follow the format: `"Sol.{number}.({letter}) {explanation}"`
5. Save the file

Example:
```javascript
{
  question_number: 5,
  text: "Question text here...",
  options: { A: "...", B: "...", C: "...", D: "..." },
  correct_answer_index: 1,
  year: "2023",
  solution: "Sol.5.(b) Your explanation here..."  // ← Add this line
}
```

## File Locations

All English chapter files are located in:
- `/chapters/Grammar.js`
- `/chapters/Vocabulary.js`
- `/chapters/Comprehension.js`

Each file follows the same structure with the `subject: "english"` property.
