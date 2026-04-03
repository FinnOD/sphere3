import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';

export default tseslint.config(
    ...tseslint.configs.strictTypeChecked,
    ...svelte.configs['flat/recommended'],
    {
        files: ['**/*.svelte'],
        languageOptions: {
            parserOptions: {
                parser: tseslint.parser
            }
        }
    },
    // Disable type-checked rules for files outside the TS project
    {
        files: ['**/*.svelte', '*.config.js', '*.config.ts', 'eslint.config.js'],
        ...tseslint.configs.disableTypeChecked
    },
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['*.config.js', '*.config.ts', 'eslint.config.js']
                },
                extraFileExtensions: ['.svelte']
            }
        }
    },
    {
        ignores: ['dist/**']
    },
    {
        rules: {
            '@typescript-eslint/no-unused-vars': 'off',
            // noUncheckedIndexedAccess requires ! to narrow index access; the two rules conflict
            '@typescript-eslint/no-non-null-assertion': 'off',
            // Numbers are fine in template literals
            '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }]
        }
    }
);
