const lenderList = [
  {
    name: "VIVIFI",
    age: 21,
    pincodes: ["*"],
    minIncome: 15000,
    UTM: "https://online.flexsalary.com/CustomerLogin/Index?CampaignID=9192300#x",
    approval: "Good",
    loanAmount: "Up to ₹3,00,000",
    interestRate: "Starting from 1.5% per month",
    processingFee: "Starting from 2% of the approved loan amount",
    support: "24/7 customer support",
    ratings: 4.2,
    features: [
      "Credit Line Facility",
      "Instant Disbursal",
      "Flexible Repayment",
      "No Fixed EMI",
      "Minimal Documentation",
      "24/7 support"
    ],
    applyLink: "/LenderAPI/vivifi",
    loanTypes: ["instant", "personal"],
    isActive: true
  },
  { 
    name: "MV", 
    age: 20, 
    pincodes: ["125042", "125043","125042","125001"], 
    minIncome: 20000,
    UTM:"https://moneyview.in/personal-loan?utm_source=covermantra",
    approval: "Good",
    loanAmount: "Up to ₹5,00,000",
    interestRate: "Starting from 1.33% per month",
    processingFee: "Starting from 2% of the approved loan amount",
    support: "24/7 customer support",
    ratings: 4.5,
    features: [
      "Direct bank transfer",
      "Paperless process",
      "Minimal documentation",
      "Flexible repayment tenures"
    ],
    applyLink: "/LenderAPI/moneyView",
    loanTypes: ["personal"],
    isActive: false
  },
  { 
    name: "Zype", 
    age: 20, 
    pincodes: ["125042", "123045", "100001","125001"], 
    minIncome: 18000,
    UTM:"https://zype.onelink.me/vx8a?af_xp=custom&pid=CustomerSource&af_dp=com.zype.mobile%3A%2F%2F&deep_link_value=myZype&af_click_lookback=30d&c=Spiraea",
    approval: "Good",
    loanAmount: "Up to ₹3,00,000",
    interestRate: "Starting from 1.5% per month",
    processingFee: "Starting from 2% to 6% on every loan",
    support: "24/7 customer support",
    ratings: 4.0,
    features: [
      "Quick disbursement",
      "Paperless process",
      "Low processing fee",
      "Instant approval",
      "No hidden charges",
      "24/7 customer support"
    ],
    applyLink: "/LenderAPI/zype",
    loanTypes: ["instant", "personal"],
    isActive: false
  },
  { 
    name: "FATAKPAY Loans", 
    age: 20, 
    pincodes: ["123042", "500001","125042","125001"], 
    minIncome: 16000,
    UTM: "https://web.fatakpay.com/authentication/login?utm_source=651_TT83W&utm_medium=covermantra",
    approval: "Good",
    loanAmount: "Up to ₹2,00,000",
    interestRate: "Starting from 12% to 35.95% per month",
    processingFee: "Starting from 2.5% of the approved loan amount",
    support: "24/7 customer support",
    ratings: 4.0,
    features: [
      "Quick disbursement",
      "Paperless process",
      "Low processing fee",
      "Instant approval",
      "No hidden charges",
      "24/7 customer support"
    ],
    applyLink: "/LenderAPI/fatakPay",
    loanTypes: ["instant", "personal"],
    isActive: true
  },
  {
    name: "Credify",
    age: 21,
    pincodes: ["*", "!18", "!19", "!78", "!79"],
    minIncome: 20000,
    UTM: "https://loan.credittnow.com/auth/login?utm_source=cover_mantra&utm_medium=website&utm_campaign=loan_campaign",
    approval: "Good",
    loanAmount: "₹8,000 to ₹35,000",
    interestRate: "Starting from 0.2% - 0.3% per day (APR: 24% - 36% p.a.)",
    processingFee: "Approx. 4% - 6% + GST (Deducted at disbursement)",
    support: "24/7 customer support",
    ratings: 4.3,
    features: [
      "Digital In-Principle Evaluation & Quick Disbursal",
      "Daily Rate: 0.2% - 0.3%/day (APR: 24% - 36% p.a.)",
      "Zero Prepayment Penalty: Pay only for days utilized",
      "Fee deducted directly from bank disbursement",
      "Salaried Only (Income >= ₹20k | Min CIBIL: 680/720)",
      "Flexible Tenure: 91 to 365 Days (Compliant with Meta)"
    ],
    applyLink: "/LenderAPI/credify",
    loanTypes: ["instant", "personal"],
    isActive: true
  }
];

module.exports = lenderList;
