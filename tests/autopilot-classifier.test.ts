import assert from 'node:assert/strict';
import test from 'node:test';
import { detectServiceProfile } from '../src/autopilot/autopilot-classifier';

test('Autopilot recognizes only clear business consulting descriptions', () => {
  assert.equal(detectServiceProfile('Serviços de consultoria empresarial'), 'business_consulting');
  assert.equal(detectServiceProfile('Assessoria empresarial para gestão da companhia'), 'business_consulting');
});

test('Autopilot refuses specialized or ambiguous consulting descriptions', () => {
  assert.equal(detectServiceProfile('Consultoria empresarial financeira'), undefined);
  assert.equal(detectServiceProfile('Consultoria contábil'), undefined);
  assert.equal(detectServiceProfile('Consultoria de tecnologia e software'), undefined);
  assert.equal(detectServiceProfile('Consultoria'), undefined);
});
