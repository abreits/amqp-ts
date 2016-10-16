/**
 * Created by Ab on 9-4-2015.
 */

var gulp = require('gulp');
var del = require('del');
var rename = require('gulp-rename');
var merge = require('merge2');
var addsrc = require('gulp-add-src');
var ts = require('gulp-typescript');
var tslint = require('gulp-tslint');
var sourcemaps = require('gulp-sourcemaps');
var mocha = require('gulp-spawn-mocha');

// swallow errors in watch
function swallowError (error) {

  //If you want details of the error in the console
  console.log(error.toString());

  this.emit('end');
}

//define typescript project
var tsProject = ts.createProject({
  module: 'commonjs',
  target: 'ES5',
  declaration: true
});

gulp.task('default', ['build:clean']);

gulp.task('build', ['compile', 'copy-to-lib', 'test:dot']);
gulp.task('build:clean', ['clean', 'compile', 'test:dot']);

gulp.task('watch', ['clean', 'build'], function () {
  gulp.watch('server/**/*.ts', ['build']);
});


gulp.task('clean', function (cb) {
  del.sync([
    'coverage',
    'transpiled'
  ]);
  cb();
});

gulp.task('clean:all', function () {
  del([
    'coverage',
    'transpiled',
    'node_modules'
  ]);
});


gulp.task('compile', function () {
  // compile typescript
  var tsResult = gulp.src('src/**/*.ts')
    .pipe(tslint({
      configuration: 'tools/tslint/tslint-node.json'
    }))
    .pipe(tslint.report('prose', {
      emitError: false
    }))
//    .pipe(addsrc.prepend('typings*/**/*.d.ts'))
    .pipe (sourcemaps.init())
    .pipe (ts(tsProject));

  return merge([
    tsResult.js
      .pipe(sourcemaps.write('.', {
        includeContent: false,
        sourceRoot: '../src/'
      }))
      .pipe(gulp.dest('transpiled')),
    tsResult.dts.pipe(gulp.dest('transpiled'))
  ]);
});


gulp.task('lint', function () {
  return gulp.src('src/**/*.ts')
    .pipe(tslint({
      configuration: 'tools/tslint/tslint-node.json'
    }))
    .pipe(tslint.report('full'));
});

gulp.task('copy-to-lib', ['compile'], function () {
  return gulp.src('transpiled/amqp-ts.js')
  .pipe(gulp.dest('lib'));
});

// unit tests, more a fast integration test because at the moment it uses an external AMQP server
gulp.task('test', ['copy-to-lib'], function () {
  return gulp.src('transpiled/**/*.spec.js', {
    read: false
  })
    .pipe(mocha({
      r: 'tools/mocha/setup.js',
      reporter: 'spec' // 'spec', 'dot'
    }))
    .on('error', swallowError);
});

// unit tests, more a fast integration test because at the moment it uses an external AMQP server
gulp.task('test:dot', ['copy-to-lib'], function () {
  return gulp.src('transpiled/**/*.spec.js', {
    read: false
  })
    .pipe(mocha({
      r: 'tools/mocha/setup.js',
      reporter: 'dot' // 'spec', 'dot'
    }))
    .on('error', swallowError);
});

// integration tests, at the moment more an extended version of the unit tests
gulp.task('test:integration', ['copy-to-lib'], function () {
  return gulp.src('transpiled/**/*.spec-i.js', {
    read: false
  })
    .pipe(mocha({
      reporter: 'dot' // 'spec', 'dot'
    }))
    .on('error', swallowError);
});

gulp.task('test:coverage', ['copy-to-lib'], function () {
  return gulp.src('transpiled/**/*.spec.js', {
    read: false
  })
    .pipe(mocha({
      reporter: 'spec', // 'spec', 'dot'
      istanbul: true
    }));
});


