// @flow
import expect from 'expect'

import createWebpackConfig, {
  COMPAT_CONFIGS,
  getCompatConfig,
  mergeLoaderConfig,
  mergeRuleConfig,
  loaderConfigName,
} from '../src/createWebpackConfig'

function getLoaders(rules) {
  return rules.map((rule) => {
    // Style chains
    if (rule.use) {
      return rule.use.map(loader => loader.loader).join('\n')
    }
    return rule.loader
  }).join('\n')
}

describe('createWebpackConfig()', () => {
  context('with only entry config', () => {
    const config = createWebpackConfig({ entry: ['index.js'] })
    it('creates a default webpack build config', () => {
      expect(Object.keys(config)).toEqual(['module', 'output', 'plugins', 'resolve', 'resolveLoader', 'entry'])
      expect(getLoaders(config.module.rules))
        .toContain('babel-loader')
        .toContain('extract-text-webpack-plugin')
        .toContain('css-loader')
        .toContain('postcss-loader')
        .toContain('url-loader')
      expect(config.resolve.extensions).toEqual(['.js', '.json'])
    })
    it('excludes node_modules from babel-loader', () => {
      expect(config.module.rules[0].exclude.test('node_modules')).toBe(true)
    })
    it('adds default polyfills to the entry chunk', () => {
      expect(config.entry).toEqual([require.resolve('../polyfills'), 'index.js'])
    })
  })

  context('with a default rule disabled', () => {
    const config = createWebpackConfig({ entry: ['index.js'] }, {}, { webpack: { rules: { babel: false } } })
    it('excludes the rule', () => {
      expect(getLoaders(config.module.rules))
        .toNotContain()
        .toNotContain('babel-loader')
        .toContain('extract-text-webpack-plugin')
        .toContain('css-loader')
        .toContain('postcss-loader')
        .toContain('url-loader')
    })
  })

  context('with server config', () => {
    const config = createWebpackConfig({ entry: ['index.js'], server: {} })
    it('creates a server webpack config', () => {
      expect(getLoaders(config.module.rules))
        .toContain('babel-loader')
        .toContain('style-loader')
        .toContain('css-loader')
        .toContain('postcss-loader')
        .toContain('url-loader')
      expect(config.resolve.extensions).toEqual(['.js', '.json'])
    })
  })

  context('with polyfill=false config', () => {
    const config = createWebpackConfig({ entry: ['index.js'], polyfill: false })
    it('skips default polyfilling', () => {
      expect(config.entry).toEqual(['index.js'])
    })
  })

  context('configuring styles', () => {
    const cssPreprocessorPluginConfig = {
      cssPreprocessors: {
        sass: {
          test: /\.scss$/,
          loader: 'path/to/sass-loader.js',
        }
      }
    }

    context("with user config for the default CSS rule's loaders", () => {
      const config = createWebpackConfig({ server: true }, {}, {
        webpack: {
          rules: {
            css: {
              options: {
                a: 1,
                b: 2,
              }
            },
          }
        }
      })
      it('applies user config to loaders', () => {
        const rules = config.module.rules.filter(rule => rule.test.test('.css'))
        expect(rules.length).toBe(1)
        expect(rules[0].use).toMatch([
          { loader: /style-loader/ },
          {
            loader: /css-loader/,
            options: { a: 1, b: 2 }
          },
          { loader: /postcss-loader/ },
        ])
      })
    })

    context('with plugin config for a CSS preprocessor', () => {
      const config = createWebpackConfig({ server: true }, cssPreprocessorPluginConfig)

      it('creates a default style rule', () => {
        const rules = config.module.rules.filter(rule => rule.test.test('.scss'))
        expect(rules.length).toBe(1)
        expect(rules[0].use).toMatch([
          { loader: /style-loader/ },
          { loader: /css-loader/ },
          { loader: /postcss-loader/ },
          { loader: /path\/to\/sass-loader\.js$/ },
        ])
      })
    })

    context('with plugin config for a CSS preprocessor and user config for its loaders', () => {
      const config = createWebpackConfig({ server: true }, cssPreprocessorPluginConfig, {
        webpack: {
          rules: {
            sass: {
              options: {
                a: 1,
                b: 2,
              }
            }
          }
        }
      })
      it('applies user config to the preprocessor rule', () => {
        const rule = config.module.rules.filter(rule => rule.test.test('.scss'))[0]
        expect(rule).toExist()
        expect(rule.use).toMatch([
          { loader: /style-loader/ },
          { loader: /css-loader/ },
          { loader: /postcss-loader/ },
          {
            loader: /path\/to\/sass-loader\.js$/,
            options: { a: 1, b: 2 },
          },
        ])
      })
    })

    context('with custom style rules', () => {
      const config = createWebpackConfig({ server: true }, {}, {
        webpack: {
          styles: {
            css: [
              {
                include: 'src/components',
                loaders: {
                  css: {
                    options: {
                      modules: true,
                      localIdentName: '[hash:base64:5]',
                    }
                  }
                }
              },
              {
                exclude: 'src/components',
              }
            ]
          }
        }
      })

      it('creates a rule for each given configuration object', () => {
        const rules = config.module.rules.filter(rule => rule.test.test('.css'))
        expect(rules.length).toBe(2)
        expect(rules[0].include).toBe('src/components')
        expect(rules[0].use).toMatch([
          { loader: /style-loader/ },
          {
            loader: /css-loader/,
            options: {
              modules: true,
              localIdentName: '[hash:base64:5]',
            }
          },
          { loader: /postcss-loader/ },
        ])
        expect(rules[1].exclude).toBe('src/components')
        expect(rules[1].use).toMatch([
          { loader: /style-loader/ },
          { loader: /css-loader/ },
          { loader: /postcss-loader/ },
        ])
      })
    })

    // TODO Remove in a future version
    context("with styles: 'old' config for backwards-compatibility", () => {
      function findSassRule(rules) {
        return rules.filter(rule =>
          rule.test.test('.scss') && rule.exclude
        )[0]
      }

      function findVendorSassRule(rules) {
        return rules.filter(rule =>
          rule.test.test('.scss') && rule.include
        )[0]
      }

      context('with plugin config for a CSS preprocessor', () => {
        const config = createWebpackConfig({ server: true }, cssPreprocessorPluginConfig, {
          webpack: {
            styles: 'old'
          }
        })
        it('creates a style loading pipeline', () => {
          const rule = findSassRule(config.module.rules)
          expect(rule).toExist()
          expect(rule.use).toMatch([
            { loader: /style-loader/ },
            { loader: /css-loader/ },
            { loader: /postcss-loader/ },
            { loader: /path\/to\/sass-loader\.js$/ },
          ])
          expect(rule.exclude.test('node_modules')).toBe(true, 'app rule should exclude node_modules')
        })
        it('creates a vendor style loading pipeline', () => {
          const rule = findVendorSassRule(config.module.rules)
          expect(rule).toExist()
          expect(rule.use).toMatch([
            { loader: /style-loader/ },
            { loader: /css-loader/ },
            { loader: /postcss-loader/ },
            { loader: /path\/to\/sass-loader\.js$/ },
          ])
          expect(rule.include.test('node_modules')).toBe(true, 'vendor rule should include node_modules')
        })
      })

      context('with plugin config for a CSS preprocessor and user config for its rule', () => {
        const config = createWebpackConfig({ server: true }, cssPreprocessorPluginConfig, {
          webpack: {
            styles: 'old',
            rules: {
              sass: {
                options: {
                  a: 1,
                  b: 2,
                }
              }
            }
          }
        })
        it('applies user config to the preprocessor rule', () => {
          const rule = findSassRule(config.module.rules)
          expect(rule).toExist()
          expect(rule.use).toMatch([
            { loader: /style-loader/ },
            { loader: /css-loader/ },
            { loader: /postcss-loader/ },
            {
              loader: /path\/to\/sass-loader\.js$/,
              options: { a: 1, b: 2 },
            },
          ])
        })
        it('only applies user config to the appropriate rule', () => {
          const rule = findVendorSassRule(config.module.rules)
          expect(rule).toExist()
          expect(rule.use).toMatch([
            { loader: /style-loader/ },
            { loader: /css-loader/ },
            { loader: /postcss-loader/ },
            { loader: /path\/to\/sass-loader\.js$/ },
          ])
        })
      })
    })
  })

  context('with aliases config', () => {
    it('sets up resolve.alias', () => {
      const config = createWebpackConfig({}, {}, {
        webpack: {
          aliases: {
            src: 'test'
          }
        }
      })
      expect(config.resolve.alias.src).toEqual('test')
    })
    it('overwrites build resolve.alias config', () => {
      const config = createWebpackConfig({
        resolve: {
          alias: {
            src: 'fail'
          }
        }
      }, {}, {
        webpack: {
          aliases: {
            src: 'pass'
          }
        }
      })
      expect(config.resolve.alias.src).toEqual('pass')
    })
  })

  context('with aliases config', () => {
    it('overwrites build output.publicPath config', () => {
      const config = createWebpackConfig({
        output: {
          publicPath: 'fail'
        }
      }, {}, {
        webpack: {
          publicPath: 'pass'
        }
      })
      expect(config.output.publicPath).toEqual('pass')
    })
  })

  context('with compat config', () => {
    it('creates and merges compat config', () => {
      const config = createWebpackConfig({}, {}, {
        webpack: {
          compat: {
            enzyme: true,
          }
        }
      })
      expect(config.externals).toEqual(COMPAT_CONFIGS.enzyme.externals)
    })
  })

  context('with extra config', () => {
    it('merges extra config', () => {
      const config = createWebpackConfig({}, {}, {
        webpack: {
          extra: {
            resolve: {
              alias: {
                test: './test',
              }
            },
            foo: 'bar',
          }
        }
      })
      expect(config.resolve.alias).toEqual({ test: './test' })
      expect(config.foo).toEqual('bar')
    })
  })
})

describe('loaderConfigName()', () => {
  it('returns the given value if a falsy prefix was given', () => {
    const name = loaderConfigName(null)
    expect(name('css')).toEqual('css')
    expect(name('style')).toEqual('style')
  })
  it('prefixes the value if a prefix was given', () => {
    const name = loaderConfigName('vendor')
    expect(name('css')).toEqual('vendor-css')
    expect(name('style')).toEqual('vendor-style')
  })
  it('returns the prefix if it ends with the given value', () => {
    let name = loaderConfigName('sass')
    expect(name('css')).toEqual('sass-css')
    expect(name('sass')).toEqual('sass')
    name = loaderConfigName('vendor-sass')
    expect(name('css')).toEqual('vendor-sass-css')
    expect(name('sass')).toEqual('vendor-sass')
  })
})

describe('mergeRuleConfig()', () => {
  const TEST_RE = /\.test$/
  const EXCLUDE_RE = /node_modules/
  const rule = { test: TEST_RE, loader: 'one', exclude: EXCLUDE_RE }
  it('merges default, build and user config for a rule', () => {
    expect(mergeRuleConfig(
      { ...rule, options: { a: 1 } },
      { options: { b: 2 } },
      { options: { c: 3 } },
    )).toEqual({
      test: TEST_RE,
      loader: 'one',
      exclude: EXCLUDE_RE,
      options: { a: 1, b: 2, c: 3 },
    })
  })
  it('only adds an options prop if the merged options have props', () => {
    expect(mergeRuleConfig(rule, {}, {})).toEqual({
      test: TEST_RE,
      loader: 'one',
      exclude: EXCLUDE_RE,
    })
  })
  it('removes the merged options when it has no properties', () => {
    expect(mergeRuleConfig(rule, {}, { options: {} })).toEqual({
      test: TEST_RE,
      loader: 'one',
      exclude: EXCLUDE_RE,
    })
  })
  it('replaces lists when merging options instead of concatenating them', () => {
    expect(mergeRuleConfig(
      rule,
      { options: { optional: ['two'] } },
      { options: { optional: ['three'] } }
    )).toEqual({
      test: TEST_RE,
      loader: 'one',
      exclude: EXCLUDE_RE,
      options: {
        optional: ['three'],
      },
    })
  })
  it('deep merges options', () => {
    expect(mergeRuleConfig(
      rule,
      { options: { nested: { a: true } } },
      { options: { nested: { b: true } } },
    )).toEqual({
      test: TEST_RE,
      loader: 'one',
      exclude: EXCLUDE_RE,
      options: {
        nested: {
          a: true,
          b: true,
        }
      }
    })
  })
  it('omits default options and build config when configuring a custom loader', () => {
    expect(mergeRuleConfig(
      { ...rule, options: { a: 1 } },
      { options: { b: 2 } },
      { loader: 'custom', options: { c: 3 } },
    )).toEqual({
      test: TEST_RE,
      loader: 'custom',
      exclude: EXCLUDE_RE,
      options: { c: 3 },
    })
  })
  it('omits default options and build config when configuring a custom loader chain', () => {
    expect(mergeRuleConfig(
      { ...rule, options: { a: 1 } },
      { options: { b: 2 } },
      { use: ['three', 'two', 'one'] },
    )).toEqual({
      test: TEST_RE,
      use: ['three', 'two', 'one'],
      exclude: EXCLUDE_RE,
    })
  })
})

describe('mergeLoaderConfig()', () => {
  const loader = { loader: 'one' }
  it('merges default, build and user config for a loader', () => {
    expect(mergeLoaderConfig(
      { ...loader, options: { a: 1 } },
      { options: { b: 2 } },
      { options: { c: 3 } },
    )).toEqual({
      loader: 'one',
      options: { a: 1, b: 2, c: 3 },
    })
  })
  it('only adds an options prop if the merged options have props', () => {
    expect(mergeLoaderConfig(loader, {}, {})).toEqual({
      loader: 'one',
    })
  })
  it('removes the merged options when it has no properties', () => {
    expect(mergeLoaderConfig(loader, {}, { options: {} })).toEqual({
      loader: 'one',
    })
  })
  it('replaces lists when merging options instead of concatenating them', () => {
    expect(mergeLoaderConfig(
      { ...loader, options: { optional: ['two'] } },
      {},
      { options: { optional: ['three'] } }
    )).toEqual({
      loader: 'one',
      options: {
        optional: ['three'],
      },
    })
  })
  it('deep merges options', () => {
    expect(mergeLoaderConfig(
      loader,
      { options: { nested: { a: true } } },
      { options: { nested: { b: true } } },
    )).toEqual({
      loader: 'one',
      options: {
        nested: {
          a: true,
          b: true,
        }
      }
    })
  })
  it('omits default options configuring a custom loader', () => {
    expect(mergeLoaderConfig(
      { ...loader, options: { a: 1 } },
      { options: { b: 2 } },
      { loader: 'custom', options: { c: 3 } },
    )).toEqual({
      loader: 'custom',
      options: { c: 3 },
    })
  })
})

describe('getCompatConfig()', () => {
  it('returns null if nothing was configured', () => {
    expect(getCompatConfig()).toBe(null)
  })
  it('skips falsy config', () => {
    expect(getCompatConfig({ enzyme: false, intl: false, moment: false, 'react-intl': false, sinon: false })).toBe(null)
  })
  it('supports enzyme', () => {
    expect(getCompatConfig({ enzyme: true })).toEqual(COMPAT_CONFIGS.enzyme)
  })
  it('supports intl', () => {
    const config = getCompatConfig({ intl: { locales: ['de', 'en-gb'] } })
    if (config == null) throw new Error('Config is null')
    expect(config.plugins).toExist()
    expect(config.plugins.length).toBe(1)
    expect(config.plugins[0].resourceRegExp).toEqual(/intl[/\\]locale-data[/\\]jsonp$/)
    expect(config.plugins[0].newContentRegExp).toEqual(/^\.\/(de|en-gb)$/)
  })
  it('supports moment', () => {
    const config = getCompatConfig({ moment: { locales: ['de', 'en-gb'] } })
    if (config == null) throw new Error('Config is null')
    expect(config.plugins).toExist()
    expect(config.plugins.length).toBe(1)
    expect(config.plugins[0].resourceRegExp).toEqual(/moment[/\\]locale$/)
    expect(config.plugins[0].newContentRegExp).toEqual(/^\.\/(de|en-gb)$/)
  })
  it('supports react-intl', () => {
    const config = getCompatConfig({ 'react-intl': { locales: ['de', 'en-gb'] } })
    if (config == null) throw new Error('Config is null')
    expect(config.plugins).toExist()
    expect(config.plugins.length).toBe(1)
    expect(config.plugins[0].resourceRegExp).toEqual(/react-intl[/\\]locale-data$/)
    expect(config.plugins[0].newContentRegExp).toEqual(/^\.\/(de|en-gb)$/)
  })
  it('supports sinon', () => {
    expect(getCompatConfig({ sinon: true })).toEqual(COMPAT_CONFIGS.sinon)
  })
  it('merges multiple compat configs ', () => {
    expect(getCompatConfig({ enzyme: true, sinon: true }))
      .toEqual({ ...COMPAT_CONFIGS.enzyme, ...COMPAT_CONFIGS.sinon })
  })
})
