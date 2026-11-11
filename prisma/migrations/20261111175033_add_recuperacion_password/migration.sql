/*
  Warnings:

  - A unique constraint covering the columns `[correo]` on the table `usuarios` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `usuarios` ADD COLUMN `codigo_recuperacion_expira` DATETIME(3) NULL,
    ADD COLUMN `codigo_recuperacion_hash` VARCHAR(191) NULL,
    ADD COLUMN `correo` VARCHAR(191) NULL,
    ADD COLUMN `intentos_recuperacion` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX `usuarios_correo_key` ON `usuarios`(`correo`);
