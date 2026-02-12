#!/usr/bin/env node
'use strict';

const { buildProgram } = require('../src/cli/program');

buildProgram().parse(process.argv);
