import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';

// Chart of Accounts
const CHART_OF_ACCOUNTS = {
    income: {
        id: '4000',
        name: 'Income',
        subAccounts: {
            majorGifts: { id: '4100', name: 'Major Gifts' },
            webDonations: { id: '4200', name: 'Web Donations' },
            earnedRevenue: { id: '4300', name: 'Earned Revenue' }
        }
    },
    expenses: {
        id: '5000',
        name: 'Expenses',
        subAccounts: {
            personnelExpenses: {
                id: '5100',
                name: 'Personnel Expenses',
                subAccounts: {
                    salariesAndWages: { id: '5110', name: 'Salaries and Wages' },
                    benefitsAndTaxes: { id: '5120', name: 'Employee Benefits and Payroll Taxes' },
                    contractors: { id: '5130', name: 'Contractors' }
                }
            },
            professionalServices: {
                id: '5200',
                name: 'Outside Professional Services and Fees',
                subAccounts: {
                    legalAndAccounting: { id: '5210', name: 'Legal and Accounting Services' }
                }
            },
            facilitiesExpenses: {
                id: '5300',
                name: 'Facilities Expenses',
                subAccounts: {
                    rentAndLease: { id: '5310', name: 'Rent and Lease Expense' },
                    utilities: { id: '5320', name: 'Utilities' },
                    maintenance: { id: '5330', name: 'Maintenance and Repairs' },
                    depreciation: { id: '5340', name: 'Depreciation Expense' },
                    officeSupplies: { id: '5350', name: 'Office Supplies' },
                    internet: { id: '5360', name: 'Internet' },
                    officeExpenses: { id: '5370', name: 'Office Expenses' }
                }
            },
            technology: {
                id: '5400',
                name: 'Technology',
                subAccounts: {
                    staffComputers: { id: '5410', name: 'Staff Computers' },
                    softwareSubscriptions: { id: '5420', name: 'Software Subscriptions & Licenses' },
                    serversAndHosting: { id: '5430', name: 'Servers & Hosting' }
                }
            },
            shippingAndPostage: { id: '5500', name: 'Shipping & Postage' },
            insurance: {
                id: '5600',
                name: 'Insurance',
                subAccounts: {
                    generalLiability: { id: '5610', name: 'General Liability Insurance' },
                    otherInsurance: { id: '5620', name: 'Other Insurance' }
                }
            },
            programExpenses: {
                id: '5700',
                name: 'Program Expenses',
                subAccounts: {
                    travelAndTransportation: {
                        id: '5710',
                        name: 'Travel & Transportation',
                        subAccounts: {
                            travelExpenseDetails: { id: '5711', name: 'Travel Expense Details' }
                        }
                    },
                    resourceDistribution: {
                        id: '5720',
                        name: 'Resource Distribution',
                        subAccounts: {
                            directResources: { id: '5721', name: 'Direct Resources / Prizes / Grants' },
                            subGrants: { id: '5722', name: 'Sub-Grants To Other Orgs' }
                        }
                    }
                }
            },
            supportExpenses: {
                id: '5800',
                name: 'Support Expenses',
                subAccounts: {
                    marketingAndComm: { id: '5810', name: 'Marketing and Communications' },
                    training: { id: '5820', name: 'Training & Professional Development' },
                    conferencesCosts: { id: '5830', name: 'Meeting & Conference Costs' },
                    mealsAndEntertainment: { id: '5840', name: 'Meals & Entertainment' }
                }
            },
            fundraisingExpenses: {
                id: '5900',
                name: 'Fundraising Expenses',
                subAccounts: {
                    travelAndTransportation: { id: '5910', name: 'Travel & Transportation' },
                    events: { id: '5920', name: 'Events' },
                    other: { id: '5930', name: 'Other' }
                }
            },
            miscExpenses: { id: '5950', name: 'Miscellaneous or Other Operating Expenses' }
        }
    }
};

// Transaction processing functions
async function identifyFields(headers) {
    const { object } = await generateObject({
        schema: z.object({
            dateField: z.string().describe('The CSV header that represents the transaction date'),
            amountField: z.string().describe('The CSV header that represents the transaction amount'),
        }),
        model: openai('gpt-4'),
        prompt: `Given these CSV headers: ${headers.join(', ')}\nIdentify which header represents the transaction date and which represents the transaction amount/value.`
    });
    return object;
}

async function loadTransactions(csvPath) {
    const fileContent = readFileSync(csvPath, 'utf-8');
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
    });

    if (records.length === 0) {
        throw new Error('No transactions found in CSV file');
    }

    // Get headers from first record
    const headers = Object.keys(records[0]);
    console.log('Found CSV headers:', headers);

    // Use AI to identify date and amount fields
    const { dateField, amountField } = await identifyFields(headers);
    console.log(`AI identified date field as "${dateField}" and amount field as "${amountField}"`);

    return records.map((record, index) => {
        // First, process date and amount
        const date = dateField && record[dateField] ? new Date(record[dateField]) : null;
        const amount = amountField && record[amountField] ? 
            parseFloat(record[amountField].replace(/[$,]/g, '')) : null;

        // Create remaining fields object excluding date and amount
        const remainingFields = {};
        for (const [key, value] of Object.entries(record)) {
            if (key !== dateField && key !== amountField) {
                remainingFields[key] = value;
            }
        }

        // Return object in specified order
        return {
            date,
            amount,
            category: null,
            accountId: null,
            ...remainingFields
        };
    });
}

// Function to process all transactions
async function processTransactions(csvPath) {
    const transactions = await loadTransactions(csvPath);
    console.log(`Loaded ${transactions.length} transactions`);
    return transactions;
}

// // Movie review AI example
// const { object } = await generateObject({
//     schema: z.object({
//         title: z.string().describe('The title of the movie'),
//         rating: z.number().min(1).max(10).describe('Rating out of 10'),
//         summary: z.string().describe('Brief summary of the review'),
//         pros: z.array(z.string()).describe('List of positive points'),
//         cons: z.array(z.string()).describe('List of negative points')
//     }),
//     model: openai('gpt-4'),
//     prompt: 'Review the movie "Inception" in a structured format.'
// });

// console.log('Structured Movie Review:');
// console.log(JSON.stringify(object, null, 2));

// Test code for loading transactions
console.log('\nProcessing transactions from test.csv:');
const testTransactions = await processTransactions('test.csv');
console.log('\nStructured Transactions:');
console.log(JSON.stringify(testTransactions, null, 2));