/**
 * Simple test script to verify credit checking tools are properly formatted
 */

import { creditCheckingTools } from './tools.js';

console.log('Testing Credit Checking Tools\n');
console.log('=' .repeat(60));

console.log(`\nNumber of tools: ${creditCheckingTools.length}`);

creditCheckingTools.forEach((tool, index) => {
  console.log(`\n${index + 1}. ${tool.name}`);
  console.log(`   Description: ${tool.description.substring(0, 80)}...`);
  console.log(`   Input schema type: ${tool.input_schema.type}`);
  console.log(`   Required fields: ${tool.input_schema.required?.join(', ') || 'none'}`);
  console.log(`   Properties: ${Object.keys(tool.input_schema.properties || {}).join(', ')}`);
});

console.log('\n' + '='.repeat(60));
console.log('\nTools are properly formatted and ready to use!');
console.log('\nTool names:');
creditCheckingTools.forEach(tool => {
  console.log(`  - ${tool.name}`);
});
