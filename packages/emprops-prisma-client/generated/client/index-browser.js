
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.AssignmentScalarFieldEnum = {
  id: 'id',
  user_id: 'user_id',
  address: 'address',
  token_id: 'token_id',
  created_at: 'created_at'
};

exports.Prisma.CollectionScalarFieldEnum = {
  id: 'id',
  archived: 'archived',
  batch_max_tokens: 'batch_max_tokens',
  batch_mint_enabled: 'batch_mint_enabled',
  blockchain: 'blockchain',
  cover_image_url: 'cover_image_url',
  data: 'data',
  description: 'description',
  editions: 'editions',
  encryption_enabled: 'encryption_enabled',
  images: 'images',
  is_current: 'is_current',
  price: 'price',
  project_id: 'project_id',
  publish_date: 'publish_date',
  status: 'status',
  title: 'title',
  updated_at: 'updated_at',
  created_at: 'created_at',
  is_custodial: 'is_custodial',
  custodied_for: 'custodied_for',
  miniapp_cover_image: 'miniapp_cover_image',
  cast_hash: 'cast_hash'
};

exports.Prisma.Collection_remixScalarFieldEnum = {
  id: 'id',
  source_collection_id: 'source_collection_id',
  target_collection_id: 'target_collection_id',
  created_at: 'created_at',
  collection_preview_version_id: 'collection_preview_version_id'
};

exports.Prisma.EventScalarFieldEnum = {
  id: 'id',
  event_name: 'event_name',
  property_name: 'property_name',
  property_value: 'property_value',
  created_at: 'created_at',
  user_id: 'user_id',
  event_id: 'event_id',
  event_type: 'event_type'
};

exports.Prisma.Flat_fileScalarFieldEnum = {
  id: 'id',
  created_at: 'created_at',
  url: 'url',
  hidden: 'hidden',
  user_id: 'user_id',
  name: 'name',
  gen_in_data: 'gen_in_data',
  gen_out_data: 'gen_out_data',
  mime_type: 'mime_type',
  rel_id: 'rel_id',
  rel_type: 'rel_type',
  tags: 'tags'
};

exports.Prisma.Component_flat_fileScalarFieldEnum = {
  id: 'id',
  component_id: 'component_id',
  flat_file_id: 'flat_file_id'
};

exports.Prisma.ProjectScalarFieldEnum = {
  id: 'id',
  created_at: 'created_at',
  name: 'name',
  user_id: 'user_id',
  data: 'data',
  current_project_history_id: 'current_project_history_id',
  version: 'version',
  archived: 'archived',
  is_default: 'is_default'
};

exports.Prisma.Project_historyScalarFieldEnum = {
  id: 'id',
  created_at: 'created_at',
  data: 'data',
  user_id: 'user_id',
  project_id: 'project_id',
  name: 'name',
  images: 'images'
};

exports.Prisma.RoleScalarFieldEnum = {
  id: 'id',
  user_id: 'user_id',
  created_at: 'created_at',
  name: 'name'
};

exports.Prisma.WalletScalarFieldEnum = {
  id: 'id',
  created_at: 'created_at',
  address: 'address',
  user_id: 'user_id'
};

exports.Prisma.Credits_historyScalarFieldEnum = {
  id: 'id',
  flow: 'flow',
  amount: 'amount',
  credit_type: 'credit_type',
  created_at: 'created_at',
  user_id: 'user_id',
  comment: 'comment'
};

exports.Prisma.Credits_balanceScalarFieldEnum = {
  id: 'id',
  user_id: 'user_id',
  created_at: 'created_at',
  updated_at: 'updated_at',
  balance: 'balance',
  credit_type: 'credit_type'
};

exports.Prisma.SubscriptionScalarFieldEnum = {
  id: 'id',
  stripe_subscription_id: 'stripe_subscription_id',
  created_at: 'created_at',
  updated_at: 'updated_at',
  user_id: 'user_id',
  status: 'status',
  stripe_product_id: 'stripe_product_id',
  subscription_key: 'subscription_key',
  cancel_at_period_end: 'cancel_at_period_end',
  current_period_end: 'current_period_end',
  current_period_start: 'current_period_start'
};

exports.Prisma.CustomerScalarFieldEnum = {
  id: 'id',
  stripe_customer_id: 'stripe_customer_id',
  created_at: 'created_at',
  updated_at: 'updated_at',
  prefinery_referral_code: 'prefinery_referral_code',
  has_migrated: 'has_migrated'
};

exports.Prisma.ProductScalarFieldEnum = {
  id: 'id',
  name: 'name',
  type: 'type',
  stripe_price_id: 'stripe_price_id',
  stripe_product_id: 'stripe_product_id',
  price: 'price',
  credits_quantity: 'credits_quantity',
  credits_type: 'credits_type',
  active: 'active',
  created_at: 'created_at',
  updated_at: 'updated_at',
  lookup_key: 'lookup_key',
  rank: 'rank',
  features: 'features'
};

exports.Prisma.Project_templateScalarFieldEnum = {
  id: 'id',
  name: 'name',
  data: 'data',
  created_at: 'created_at',
  updated_at: 'updated_at',
  current_project_history_id: 'current_project_history_id'
};

exports.Prisma.Project_template_saveScalarFieldEnum = {
  id: 'id',
  name: 'name',
  data: 'data',
  images: 'images',
  created_at: 'created_at',
  updated_at: 'updated_at',
  project_template_id: 'project_template_id',
  project_history_id: 'project_history_id'
};

exports.Prisma.Collection_rewardScalarFieldEnum = {
  id: 'id',
  collection_id: 'collection_id',
  tag: 'tag',
  credits: 'credits',
  enabled: 'enabled',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Collection_reward_redemptionScalarFieldEnum = {
  id: 'id',
  user_id: 'user_id',
  wallet_address: 'wallet_address',
  token_id: 'token_id',
  collection_reward_id: 'collection_reward_id',
  created_at: 'created_at'
};

exports.Prisma.Collection_sales_receiversScalarFieldEnum = {
  id: 'id',
  collection_id: 'collection_id',
  address: 'address',
  value: 'value',
  type: 'type'
};

exports.Prisma.Collection_historyScalarFieldEnum = {
  id: 'id',
  event: 'event',
  current_value: 'current_value',
  new_value: 'new_value',
  created_at: 'created_at',
  collection_id: 'collection_id'
};

exports.Prisma.ProfileScalarFieldEnum = {
  id: 'id',
  profile_image: 'profile_image',
  profile_preference: 'profile_preference',
  created_at: 'created_at',
  updated_at: 'updated_at',
  profile_username: 'profile_username'
};

exports.Prisma.Collection_previewScalarFieldEnum = {
  id: 'id',
  enabled: 'enabled',
  max_generations: 'max_generations',
  total_generations: 'total_generations',
  collection_id: 'collection_id',
  access_level: 'access_level',
  is_remixable: 'is_remixable',
  farcaster_collection: 'farcaster_collection'
};

exports.Prisma.Collection_preview_versionScalarFieldEnum = {
  id: 'id',
  version: 'version',
  collection_preview_id: 'collection_preview_id',
  data: 'data',
  is_latest: 'is_latest',
  created_at: 'created_at'
};

exports.Prisma.Collection_sample_imagesScalarFieldEnum = {
  id: 'id',
  url: 'url',
  collection_id: 'collection_id'
};

exports.Prisma.ChatScalarFieldEnum = {
  id: 'id',
  created_at: 'created_at',
  entity_type: 'entity_type',
  entity_id: 'entity_id'
};

exports.Prisma.Chat_messageScalarFieldEnum = {
  id: 'id',
  created_at: 'created_at',
  updated_at: 'updated_at',
  user_id: 'user_id',
  content: 'content',
  chat_id: 'chat_id',
  flat_file_id: 'flat_file_id'
};

exports.Prisma.Socket_io_attachmentsScalarFieldEnum = {
  id: 'id',
  payload: 'payload',
  created_at: 'created_at'
};

exports.Prisma.ComponentScalarFieldEnum = {
  id: 'id',
  collection_id: 'collection_id',
  created_at: 'created_at',
  delete_status: 'delete_status'
};

exports.Prisma.WorkflowScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  data: 'data',
  created_at: 'created_at',
  server_id: 'server_id',
  output_mime_type: 'output_mime_type',
  display: 'display',
  label: 'label',
  order: 'order',
  type: 'type',
  est_gen_time: 'est_gen_time',
  machine_type: 'machine_type',
  min_vram: 'min_vram'
};

exports.Prisma.ServerScalarFieldEnum = {
  id: 'id',
  name: 'name',
  url: 'url',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Form_configScalarFieldEnum = {
  id: 'id',
  name: 'name',
  data: 'data',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Api_keyScalarFieldEnum = {
  id: 'id',
  alias: 'alias',
  key: 'key',
  workflow_name: 'workflow_name',
  user_id: 'user_id',
  created_at: 'created_at'
};

exports.Prisma.User_api_keysScalarFieldEnum = {
  id: 'id',
  user_id: 'user_id',
  key_hash: 'key_hash',
  name: 'name',
  expires_at: 'expires_at',
  created_at: 'created_at',
  is_active: 'is_active'
};

exports.Prisma.JobScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  status: 'status',
  data: 'data',
  progress: 'progress',
  error_message: 'error_message',
  created_at: 'created_at',
  updated_at: 'updated_at',
  started_at: 'started_at',
  completed_at: 'completed_at',
  user_id: 'user_id',
  job_type: 'job_type',
  priority: 'priority',
  retry_count: 'retry_count',
  max_retries: 'max_retries',
  workflow_output: 'workflow_output',
  is_cleanup_evaluated: 'is_cleanup_evaluated',
  status_category: 'status_category',
  problem_type: 'problem_type',
  problem_details: 'problem_details',
  evaluated_at: 'evaluated_at'
};

exports.Prisma.Job_retry_backupScalarFieldEnum = {
  id: 'id',
  original_job_id: 'original_job_id',
  retry_attempt: 'retry_attempt',
  original_data: 'original_data',
  original_status: 'original_status',
  original_workflow_output: 'original_workflow_output',
  backed_up_at: 'backed_up_at'
};

exports.Prisma.Job_historyScalarFieldEnum = {
  id: 'id',
  job_id: 'job_id',
  status: 'status',
  data: 'data',
  created_at: 'created_at',
  message: 'message',
  retry_attempt: 'retry_attempt'
};

exports.Prisma.StepScalarFieldEnum = {
  id: 'id',
  job_id: 'job_id',
  step_name: 'step_name',
  step_type: 'step_type',
  status: 'status',
  started_at: 'started_at',
  completed_at: 'completed_at',
  input_data: 'input_data',
  output_data: 'output_data',
  error_message: 'error_message',
  step_order: 'step_order',
  retry_attempt: 'retry_attempt'
};

exports.Prisma.Miniapp_userScalarFieldEnum = {
  id: 'id',
  farcaster_id: 'farcaster_id',
  farcaster_username: 'farcaster_username',
  farcaster_pfp: 'farcaster_pfp',
  wallet_address: 'wallet_address',
  created_at: 'created_at',
  updated_at: 'updated_at',
  notification_token: 'notification_token',
  split_address: 'split_address'
};

exports.Prisma.Miniapp_collection_configScalarFieldEnum = {
  id: 'id',
  collection_id: 'collection_id',
  price: 'price',
  generations_per_payment: 'generations_per_payment',
  is_active: 'is_active',
  created_at: 'created_at',
  updated_at: 'updated_at',
  max_retries: 'max_retries',
  cast_hash: 'cast_hash'
};

exports.Prisma.Miniapp_paymentScalarFieldEnum = {
  id: 'id',
  user_id: 'user_id',
  collection_id: 'collection_id',
  amount: 'amount',
  transaction_hash: 'transaction_hash',
  payment_status: 'payment_status',
  generations_allowed: 'generations_allowed',
  generations_used: 'generations_used',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Miniapp_generationScalarFieldEnum = {
  id: 'id',
  user_id: 'user_id',
  collection_id: 'collection_id',
  payment_id: 'payment_id',
  input_data: 'input_data',
  output_url: 'output_url',
  output_data: 'output_data',
  error_message: 'error_message',
  created_at: 'created_at',
  updated_at: 'updated_at',
  job_id: 'job_id',
  generated_image: 'generated_image',
  status: 'status',
  retry_count: 'retry_count'
};

exports.Prisma.ModelScalarFieldEnum = {
  id: 'id',
  name: 'name',
  downloadUrl: 'downloadUrl',
  saveTo: 'saveTo',
  description: 'description',
  fileSize: 'fileSize',
  hash: 'hash',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  authEnvVar: 'authEnvVar',
  isAuthReq: 'isAuthReq'
};

exports.Prisma.WorkflowModelScalarFieldEnum = {
  id: 'id',
  workflowId: 'workflowId',
  modelId: 'modelId',
  isRequired: 'isRequired',
  createdAt: 'createdAt'
};

exports.Prisma.Component_flat_file_recoverScalarFieldEnum = {
  id: 'id',
  component_id: 'component_id',
  flat_file_id: 'flat_file_id',
  recovered_at: 'recovered_at',
  issue_type: 'issue_type'
};

exports.Prisma.Social_linkScalarFieldEnum = {
  id: 'id',
  social_org: 'social_org',
  identifier: 'identifier',
  created_at: 'created_at',
  updated_at: 'updated_at',
  miniapp_user_id: 'miniapp_user_id'
};

exports.Prisma.CustomNodeScalarFieldEnum = {
  id: 'id',
  name: 'name',
  download_url: 'download_url',
  description: 'description',
  is_env_required: 'is_env_required',
  env_conf: 'env_conf',
  hash: 'hash',
  created_at: 'created_at',
  updated_at: 'updated_at',
  install_settings: 'install_settings',
  is_default: 'is_default',
  install_order: 'install_order'
};

exports.Prisma.WorkflowCustomNodeScalarFieldEnum = {
  id: 'id',
  workflow_id: 'workflow_id',
  custom_node_id: 'custom_node_id',
  created_at: 'created_at'
};

exports.Prisma.Cron_logScalarFieldEnum = {
  id: 'id',
  job_name: 'job_name',
  status: 'status',
  generations_processed: 'generations_processed',
  payments_processed: 'payments_processed',
  total_amount: 'total_amount',
  successful_splits: 'successful_splits',
  failed_splits: 'failed_splits',
  execution_time: 'execution_time',
  details: 'details',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Miniapp_claim_activityScalarFieldEnum = {
  id: 'id',
  user_id: 'user_id',
  split_address: 'split_address',
  amount_claimed: 'amount_claimed',
  transaction_hash: 'transaction_hash',
  claim_status: 'claim_status',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};
exports.ComponentDeleteStatus = exports.$Enums.ComponentDeleteStatus = {
  active: 'active',
  deleted: 'deleted'
};

exports.GenerationStatus = exports.$Enums.GenerationStatus = {
  idle: 'idle',
  processing: 'processing',
  completed: 'completed',
  failed: 'failed'
};

exports.social_org_enum = exports.$Enums.social_org_enum = {
  farcaster: 'farcaster',
  twitter: 'twitter',
  discord: 'discord',
  lens: 'lens',
  github: 'github'
};

exports.Prisma.ModelName = {
  assignment: 'assignment',
  collection: 'collection',
  collection_remix: 'collection_remix',
  event: 'event',
  flat_file: 'flat_file',
  component_flat_file: 'component_flat_file',
  project: 'project',
  project_history: 'project_history',
  role: 'role',
  wallet: 'wallet',
  credits_history: 'credits_history',
  credits_balance: 'credits_balance',
  subscription: 'subscription',
  customer: 'customer',
  product: 'product',
  project_template: 'project_template',
  project_template_save: 'project_template_save',
  collection_reward: 'collection_reward',
  collection_reward_redemption: 'collection_reward_redemption',
  collection_sales_receivers: 'collection_sales_receivers',
  collection_history: 'collection_history',
  profile: 'profile',
  collection_preview: 'collection_preview',
  collection_preview_version: 'collection_preview_version',
  collection_sample_images: 'collection_sample_images',
  chat: 'chat',
  chat_message: 'chat_message',
  socket_io_attachments: 'socket_io_attachments',
  component: 'component',
  workflow: 'workflow',
  server: 'server',
  form_config: 'form_config',
  api_key: 'api_key',
  user_api_keys: 'user_api_keys',
  job: 'job',
  job_retry_backup: 'job_retry_backup',
  job_history: 'job_history',
  step: 'step',
  miniapp_user: 'miniapp_user',
  miniapp_collection_config: 'miniapp_collection_config',
  miniapp_payment: 'miniapp_payment',
  miniapp_generation: 'miniapp_generation',
  model: 'model',
  workflowModel: 'workflowModel',
  component_flat_file_recover: 'component_flat_file_recover',
  social_link: 'social_link',
  customNode: 'customNode',
  workflowCustomNode: 'workflowCustomNode',
  cron_log: 'cron_log',
  miniapp_claim_activity: 'miniapp_claim_activity'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
