const { bashRunner } = require('./dist/index');

console.log('Bash Runner Piece Test');
console.log('======================');
console.log('Display Name:', bashRunner.displayName);
console.log('Description:', bashRunner.description);
console.log('Categories:', bashRunner.categories);
console.log('Authors:', bashRunner.authors);
console.log('\nPiece Structure:');
console.log(JSON.stringify(bashRunner, null, 2)); 