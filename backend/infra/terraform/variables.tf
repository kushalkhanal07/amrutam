variable "project" {
  type    = string
  default = "amrutam"
}

variable "environment" {
  type        = string
  description = "staging or production"
  default     = "staging"
}

variable "aws_region" {
  type    = string
  default = "ap-south-1" # Mumbai
}

variable "api_image" {
  type        = string
  description = "Container image, e.g. 123456789012.dkr.ecr.ap-south-1.amazonaws.com/amrutam-backend:sha"
}

variable "frontend_origin" {
  type        = string
  description = "Explicit CORS origin of the frontend"
  default     = "https://app.amrutam.example"
}

variable "acm_certificate_arn" {
  type        = string
  description = "ACM certificate for the API hostname"
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "api_cpu" {
  type    = number
  default = 512
}

variable "api_memory" {
  type    = number
  default = 1024
}

variable "api_desired_count" {
  type    = number
  default = 2
}

variable "api_max_count" {
  type    = number
  default = 10
}
