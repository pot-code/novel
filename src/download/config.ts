import fs from 'fs';
import Joi from 'joi';

export type DownloadConfig = {
  url: string;
  list_selector?: string;
  next_selector?: string;
  title: string;
  content: string;
  limit: number;
  wait: number;
};

const DownloadConfigSchema = Joi.object({
  url: Joi.string().required(),
  list_selector: Joi.string(),
  next_selector: Joi.when('list_selector', {
    is: '',
    then: Joi.string().required(),
    otherwise: Joi.string(),
  }),
  title: Joi.string().required(),
  content: Joi.string().required(),
  limit: Joi.number().integer().min(-1),
  wait: Joi.number().integer().min(0),
});

function loadConfig(path: string): DownloadConfig {
  const content = fs.readFileSync(path, 'utf-8');
  const config = JSON.parse(content) as DownloadConfig;

  const { error } = DownloadConfigSchema.validate(config);
  if (error) {
    throw error;
  }

  config.limit = config.limit === -1 ? Infinity : config.limit;
  return config;
}

export { loadConfig };
