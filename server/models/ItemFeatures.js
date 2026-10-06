const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const ItemFeatures = sequelize.define(
        'ItemFeatures', {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            itemId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                unique: true,
                field: 'item_id',
            },
            imageVector: { type: DataTypes.TEXT('long'), allowNull: true, field: 'image_vector' },
            textVector: { type: DataTypes.TEXT('long'), allowNull: true, field: 'text_vector' },
            tags: { type: DataTypes.TEXT, allowNull: true },
            extractedColor: {
                type: DataTypes.STRING(50),
                allowNull: true,
                field: 'extracted_color',
            },
            extractedStyle: {
                type: DataTypes.STRING(100),
                allowNull: true,
                field: 'extracted_style',
            },
            // Opt-in only AFTER the additive SQL upgrade. Existing schemas remain usable.
            ...(process.env.IMAGE_AI_STORAGE_ENABLED === 'true' ? {
                imagePredictions: { type: DataTypes.JSON, allowNull: true, field: 'image_predictions' },
                imageProcessedAt: { type: DataTypes.DATE, allowNull: true, field: 'image_processed_at' },
            } : {}),
            embeddingStatus: {
                type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
                defaultValue: 'pending',
                field: 'embedding_status',
            },
            embeddingError: {
                type: DataTypes.TEXT,
                allowNull: true,
                field: 'embedding_error',
            },
            processedAt: { type: DataTypes.DATE, allowNull: true, field: 'processed_at' },
        }, { tableName: 'item_features', indexes: [{ fields: ['item_id'], unique: true }] }
    );

    ItemFeatures.associate = (models) => {
        ItemFeatures.belongsTo(models.ClothingItem, { foreignKey: 'itemId', as: 'item' });
    };

    return ItemFeatures;
};