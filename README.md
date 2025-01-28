# hcb-bookkeeping-ai-playground

Scripts to explore potential of applying AI to Hack Club's books.

Give it an input CSV at `test.csv` and it will output a processed CSV at
`processed.csv` and generate a statement of activity at
`statement_of_activity.xlsx`.

Written with the help of AI.

## Notes

Types of transactions:

Income:

- External -> Web donation
- External -> Invoice payment
- External -> Direct Deposit / Wire
- External -> Check

- Internal -> Funding from another fund

Expenses:

- Fiscal sponsorship fee payment from fund -> HCB

- External -> All the standard items in chart of accounts