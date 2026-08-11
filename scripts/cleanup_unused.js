const fs = require('fs');
const files = [
  'd:/websiteCV/coverbackend/adapters/FatakpayDclAdapter.js',
  'd:/websiteCV/coverbackend/userRoutes_scratch.txt',
  'd:/websiteCV/coverbackend/updateRoutes.js',
  'd:/websiteCV/coverbackend/scripts/deleteFolders.js',
  'd:/websiteCV/coverbackend/implementation_plan.md',
  'd:/websiteCV/coverbackend/implementation_plan1.md'
];

files.forEach(f => {
  try {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      console.log('Deleted:', f);
    }
  } catch (e) {
    console.error('Error deleting:', f, e.message);
  }
});
