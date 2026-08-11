const ZypeAdapter = require("./ZypeAdapter");
const MoneyviewAdapter = require("./MoneyviewAdapter");
const VivifiAdapter = require("./VivifiAdapter");
const FatakpayLoansAdapter = require("./FatakpayLoansAdapter");

module.exports = {
  zype: new ZypeAdapter(),
  moneyview: new MoneyviewAdapter(),
  vivifi: new VivifiAdapter(),
  fatakPay: new FatakpayLoansAdapter()
};
