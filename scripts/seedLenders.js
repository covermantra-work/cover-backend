const mongoose = require("mongoose");
require("dotenv").config();
const Lender = require("../models/Lender");
const lenderList = require("../lender/lenderList");

const lendersWithLogos = [
  {
    name: "MoneyView", // Need to match or map the existing lenderList.js name
    logo: "https://moneyview.in/images/mv-green-logo-v3Compressed.svg",
    dbNameMatch: "MV"
  },
  {
    name: "FDPL Finance",
    logo: "https://www.fdplfinance.com/assets/images/logo/FatakLoans.svg",
    dbNameMatch: "FATAKPAY Loans"
  },
  {
    name: "Zype",
    logo: "https://www.getzype.com/wp-content/uploads/2024/09/Zype_svg_black.svg",
    dbNameMatch: "Zype"
  },
  {
    name: "Vivifi",
    logo: "https://www.vivifin.com/images/vivifi-logo.png",
    dbNameMatch: "VIVIFI"
  },
];

const seedLenders = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected");

    for (let i = 0; i < lenderList.length; i++) {
      const lenderData = lenderList[i];
      const existingLender = await Lender.findOne({ name: lenderData.name });

      if (!existingLender) {
        // find logo
        const logoData = lendersWithLogos.find(l => l.dbNameMatch === lenderData.name);
        
        const newLender = new Lender({
          name: lenderData.name,
          logo: logoData ? logoData.logo : "",
          age: lenderData.age,
          minIncome: lenderData.minIncome,
          pincodes: lenderData.pincodes,
          UTM: lenderData.UTM || "",
          priority: i + 1, // Start from 1
          approval: lenderData.approval,
          loanAmount: lenderData.loanAmount,
          interestRate: lenderData.interestRate,
          processingFee: lenderData.processingFee,
          support: lenderData.support,
          ratings: lenderData.ratings,
          features: lenderData.features,
          applyLink: lenderData.applyLink,
        });

        await newLender.save();
        console.log(`Inserted ${lenderData.name} with priority ${i + 1}`);
      } else {
        console.log(`${lenderData.name} already exists. Skipping.`);
      }
    }

    console.log("Seeding complete.");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding lenders:", error);
    process.exit(1);
  }
};

seedLenders();
